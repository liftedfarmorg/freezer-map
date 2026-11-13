-- Migration 348 (FB-0012, Rama; Msg FBQ-3): Set all prices on an open sales order.
-- One $/lb goes on every line of the order, except lines where the customer has a contract price for that product
-- (Aziz 11/12: only contract-priced lines are skipped; samples get the price too).
-- Each line goes through the existing set_order_line, so it is checked, logged and marked "price overridden" exactly
-- like editing the line by hand. Nothing else changes. Safe to re-run.

create or replace function set_order_prices(p_order int, p_price numeric) returns jsonb
language plpgsql security definer set search_path = public as $$
declare o orders; l order_lines; n int := 0; skipped text[] := '{}';
begin
  if not is_sales() then raise exception 'Only Sales or an Admin can change orders'; end if;
  if p_price is null or p_price < 0 then raise exception 'Enter a price of 0 or more'; end if;
  select * into o from orders where id = p_order for update;
  if o.id is null then raise exception 'Order not found'; end if;
  if o.status not in ('draft', 'pending', 'submitted') then raise exception 'That order isn''t open'; end if;
  for l in select * from order_lines where order_id = p_order order by id loop
    if contract_price(o.customer_id, coalesce(l.crop_year, crop_year()),
                      coalesce((select f.code from finishes f where f.pallet_product = coalesce(l.product, 'fresh_frozen')), 'FF')) is not null then
      skipped := skipped || l.strain;
      continue;
    end if;
    if l.price_per_lb is distinct from round(p_price, 2) then
      perform set_order_line(p_order, l.id, l.strain, l.lbs, round(p_price, 2));
      n := n + 1;
    end if;
  end loop;
  insert into events (user_email, type, details)
  values (current_email(), 'order_prices_all', jsonb_build_object('order_id', p_order, 'price', round(p_price, 2), 'lines', n, 'skipped', skipped,
          'customer', (select name from customers where id = o.customer_id)));
  return jsonb_build_object('changed', n, 'skipped', skipped);
end $$;
revoke all on function set_order_prices(int, numeric) from public, anon;
grant execute on function set_order_prices(int, numeric) to authenticated;

select 'set_order_prices ready' as done, to_regprocedure('set_order_prices(int, numeric)') is not null as ok;
