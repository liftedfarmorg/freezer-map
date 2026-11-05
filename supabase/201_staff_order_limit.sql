-- Migration 201: staff orders can't go past what's available either (Aziz 11/4).
-- The portal already checks in place_order / update_my_order. This adds the same check in the database for every other
-- way a fresh frozen line gets added or raised: New sales order (create_order), Add / Edit on an order (set_order_line),
-- changing a line's crop year (set_order_line_year), anything else that writes order_lines.
-- Available = what this customer can order of that strain + crop year (_orderable: their reserve left + open menu + their
-- sample holds, less their own submitted orders), plus the line's own lbs when it's being changed (already counted).
-- Lowering lbs is always fine. Not checked: Roshi imports (source 'roshi'), dry products, orders that already shipped or
-- were cancelled, and lines fulfillment already set to the picked weight (ordered_lbs filled in). Safe to re-run. Run after 200.
set client_min_messages = warning;

create or replace function _order_line_limit() returns trigger
language plpgsql security definer set search_path = public as $$
declare o orders; can numeric; back numeric := 0; same_pool boolean;
begin
  if coalesce(new.product, 'fresh_frozen') <> 'fresh_frozen' then return new; end if;
  if new.ordered_lbs is not null then return new; end if;   -- fulfillment set it to what was actually picked (025), or QBO history
  if tg_op = 'UPDATE' then
    same_pool := lower(old.strain) = lower(new.strain) and old.crop_year is not distinct from new.crop_year
                 and coalesce(old.product, 'fresh_frozen') = 'fresh_frozen' and old.order_id = new.order_id;
    if same_pool and new.lbs <= old.lbs then return new; end if;            -- lowering (or no change) is always fine
    if same_pool then back := old.lbs; end if;                              -- its current lbs are already counted as taken
  end if;
  select * into o from orders where id = new.order_id;
  if o.id is null or o.status not in ('submitted', 'pending') or coalesce(o.source, '') = 'roshi' then return new; end if;
  select coalesce(max(x.can_order), 0) into can
    from _orderable(o.customer_id) x
   where lower(x.strain) = lower(new.strain) and x.crop_year = coalesce(new.crop_year, crop_year());
  if new.lbs > can + back then
    raise exception 'Only % lbs of % (% crop) available for this customer', greatest(can + back, 0), new.strain, coalesce(new.crop_year, crop_year());
  end if;
  return new;
end $$;
revoke all on function _order_line_limit() from public, anon, authenticated;

drop trigger if exists order_line_limit on order_lines;
create trigger order_line_limit before insert or update of lbs, strain, crop_year, product, order_id on order_lines
  for each row execute function _order_line_limit();
