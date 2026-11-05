-- 211: staff order to the exact pound (Msg #230, Aziz 11/5). The portal keeps rounding down to 10 lbs for customers.
--  * _orderable_exact(customer): same as _orderable (reserve left + their holds + open menu - their own submitted orders),
--    but whole pounds instead of rounded down to 10.
--  * staff_ff_open(): fresh frozen open on the menu per strain + crop year, whole pounds (staff screens' strain lists).
--  * _order_line_limit (201): a staff login (no customer) checks against the exact numbers; customers still the rounded ones.
-- Safe to re-run. Run after 210.
set client_min_messages = warning;

create or replace function _orderable_exact(p_customer int)
returns table (strain text, crop_year int, my_left numeric, open_lbs numeric, can_order numeric)
language sql stable security definer set search_path = public as $$
  select m.strain, m.crop_year, x.mine, x.open, greatest(x.mine + x.open - x.waiting, 0)
    from _menu_numbers() m
    join customers c on c.id = p_customer
    left join reserve_balances b on b.crop_year = m.crop_year and b.customer_id = p_customer and lower(b.strain) = lower(m.strain)
    cross join lateral (select coalesce(sum(h.remaining), 0) as lbs from _sample_holds() h
                         where h.customer_id = p_customer and lower(h.strain) = lower(m.strain) and h.crop_year = m.crop_year and h.state in ('waiting','active')) hold
    cross join lateral (select coalesce(sum(l.lbs + case when l.is_sample then coalesce(l.hold_lbs, 0) else 0 end), 0) as lbs
                          from orders o join order_lines l on l.order_id = o.id
                         where o.customer_id = p_customer and o.status = 'submitted' and l.product = 'fresh_frozen'
                           and lower(l.strain) = lower(m.strain) and l.crop_year = m.crop_year) sub
    cross join lateral (select
      (case when c.reserves_enabled then floor(greatest(coalesce(b.remaining, 0), 0)) else 0 end) + floor(hold.lbs) as mine,
      case when m.on_menu then greatest(floor(m.free), 0) else 0 end as open,
      sub.lbs as waiting) x
$$;
revoke all on function _orderable_exact(int) from public, anon, authenticated;

create or replace function staff_ff_open()
returns table (strain text, crop_year int, open_lbs numeric)
language sql stable security definer set search_path = public as $$
  select m.strain, m.crop_year, greatest(floor(m.free), 0)
    from _menu_numbers() m
   where is_staff() and m.on_menu and m.free >= 1
$$;
revoke all on function staff_ff_open() from public, anon;
grant execute on function staff_ff_open() to authenticated;

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
  if my_customer() is null then   -- staff: to the pound (211)
    select coalesce(max(x.can_order), 0) into can from _orderable_exact(o.customer_id) x
     where lower(x.strain) = lower(new.strain) and x.crop_year = coalesce(new.crop_year, crop_year());
  else                            -- customer: rounded down to 10, same as the portal
    select coalesce(max(x.can_order), 0) into can from _orderable(o.customer_id) x
     where lower(x.strain) = lower(new.strain) and x.crop_year = coalesce(new.crop_year, crop_year());
  end if;
  if new.lbs > can + back then
    raise exception 'Only % lbs of % (% crop) available for this customer', greatest(can + back, 0), new.strain, coalesce(new.crop_year, crop_year());
  end if;
  return new;
end $$;
revoke all on function _order_line_limit() from public, anon, authenticated;

select 'ok 211' as done;
