-- 209: staff can change an order's Requested Delivery Date (orders.wanted_date) on the Orders screen (Msg #226, 11/4).
-- Sales or Admin, open orders only (submitted / pending). Logged as an 'order_wanted' event with the old date.
-- The customer sees the new date in the portal (same field).
create or replace function set_order_wanted(p_order int, p_date date) returns void
language plpgsql security definer set search_path = public as $$
declare o orders;
begin
  if not is_sales() then raise exception 'Only Sales or an Admin can change orders'; end if;
  select * into o from orders where id = p_order for update;
  if o.id is null then raise exception 'Order not found'; end if;
  if o.status not in ('pending', 'submitted') then raise exception 'That order isn''t open'; end if;
  if o.wanted_date is not distinct from p_date then return; end if;
  update orders set wanted_date = p_date, updated_at = now() where id = o.id;
  insert into events (user_email, type, details)
  values (current_email(), 'order_wanted', jsonb_build_object('order_id', o.id, 'so', o.so_number, 'wanted', p_date, 'was', o.wanted_date,
          'customer', (select name from customers where id = o.customer_id)));
end $$;
revoke execute on function set_order_wanted(int, date) from public, anon;
grant execute on function set_order_wanted(int, date) to authenticated;
