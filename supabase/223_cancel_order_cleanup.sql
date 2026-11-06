-- 223: Cancel order cleans up (change-order plan C, Msg #266). Plan: change-order-walkthrough-250.md situations 1-4, 16;
-- decisions in change-order-decisions-251.md.
-- Sales > Cancel order (set_order_status 'cancelled'):
--  * Not on a load: as before (pallets come off the order, holds come off).
--  * On a load in Planning / Loading: its pallets come off the load and an emptied stop is removed. If any of its pallets
--    are already on the truck it stops and names them: unload them first.
--  * Load Departing: stops. Back to loading on the load (or Rama voids the manifest), unload, then cancel.
--    (The app voiding that stop's manifest itself is part D.)
--  * On the road: stops. The driver or office records Not delivered > Customer cancelled; it cancels once received back.
--  * Shipped / delivered: stops. Product coming back goes through Returns, money through a credit memo.
--  * GVR pallets staged at OHR for it: Distribution gets an alert to Move them back to GVR (or use them on another order),
--    and Staging shows the same flag.
--  * An invoice already exists: Accounting flag (Matt, Nikki, Accounting module) to make the credit memo.
-- Staging also flags a staged GVR pallet whose order isn't shipping for more than 2 days (Aziz 11/5): Move back to GVR.
-- Safe to re-run.
begin;

create or replace function _cancel_order_guard(o orders) returns void
language plpgsql security definer set search_path = public as $$
declare s load_stops; l loads; on_truck text;
begin
  if o.status = 'shipped' then
    raise exception 'Order % is shipped. Product coming back goes through Returns, and a credit memo on its invoice fixes the money.', coalesce(o.so_number, '#' || o.id);
  end if;
  if o.stop_id is null then return; end if;
  select * into s from load_stops where id = o.stop_id;
  select * into l from loads where id = s.load_id;
  if l.id is null or l.status in ('cancelled', 'delivered') then return; end if;
  if l.status = 'in_transit' then
    raise exception '% is on the road. Record the stop as Not delivered > Customer cancelled; the order cancels once the product is received back.', l.code;
  end if;
  if l.status = 'departing' then
    raise exception '% is departing (its METRC manifest is being made). Hit Back to loading on the load (or Rama voids the manifest first), unload its pallets, then cancel.', l.code;
  end if;
  select string_agg(distinct p.code, ', ') into on_truck
    from load_items i join pallets p on p.id = i.pallet_id
   where i.stop_id = s.id and i.loaded
     and i.pallet_id in (select coalesce(pp.container_id, pp.id) from order_picks x join pallets pp on pp.id = x.pallet_id where x.order_id = o.id);
  if on_truck is not null then
    raise exception '% already on the truck for %. Unload it back into a freezer first (Transit > %), then cancel.', on_truck, l.code, l.code;
  end if;
  delete from load_items i where i.stop_id = s.id
     and i.pallet_id in (select coalesce(pp.container_id, pp.id) from order_picks x join pallets pp on pp.id = x.pallet_id where x.order_id = o.id);
end $$;
revoke all on function _cancel_order_guard(orders) from public, anon, authenticated;

create or replace function _cancel_order_after(o orders) returns void
language plpgsql security definer set search_path = public as $$
declare s load_stops; l loads; c customers; g record; inv invoices; so text := coalesce(o.so_number, '#' || o.id);
begin
  select * into c from customers where id = o.customer_id;
  -- an emptied stop comes off the load (unless it's the load's only stop)
  if o.stop_id is not null then
    select * into s from load_stops where id = o.stop_id;
    select * into l from loads where id = s.load_id;
    if l.status in ('planning', 'loading') and not exists (select 1 from load_items where stop_id = s.id)
       and not exists (select 1 from orders where stop_id = s.id and id <> o.id and status <> 'cancelled')
       and (select count(*) from load_stops where load_id = l.id) > 1 then
      update orders set stop_id = null where stop_id = s.id;
      delete from load_stops where id = s.id;
    end if;
    insert into events (user_email, type, load_id, details)
    values (current_email(), 'fulfill_unloaded', l.id, jsonb_build_object('load', l.code, 'order_id', o.id, 'so', o.so_number, 'why', 'order cancelled'));
  end if;
  -- GVR pallets staged at OHR for it
  for g in select gs.id, p.code from gvr_stages gs join pallets p on p.id = gs.pallet_id where gs.order_id = o.id and gs.status = 'staged' loop
    perform _alert('distribution', false, 'gvr_back', 'Move ' || g.code || ' back to GVR: ' || so || ' cancelled',
      g.code || ' was staged at OHR for ' || coalesce(c.name, 'the customer') || '. Staging > Move back to GVR (it voids or updates its METRC manifest), or put it on another order.',
      jsonb_build_object('stage_id', g.id, 'order_id', o.id));
  end loop;
  -- money already invoiced
  select * into inv from invoices where order_id = o.id and status <> 'void' order by id desc limit 1;
  if inv.id is not null then
    perform _alert('accounting', false, 'acct_flag', 'Credit memo: ' || so || ' cancelled after its invoice ' || inv.inv_number,
      coalesce(c.name, '') || ': ' || inv.inv_number || ' (' || to_char(inv.total, 'FM$999,999,990.00') || ')' ||
      case when inv.acct_status = 'sent' then ' is in QuickBooks.' else ' isn''t in QuickBooks yet.' end || ' Make a credit memo on it (reason: cancelled).',
      jsonb_build_object('invoice_id', inv.id, 'order_id', o.id));
  end if;
end $$;
revoke all on function _cancel_order_after(orders) from public, anon, authenticated;

CREATE OR REPLACE FUNCTION public.set_order_status(p_id integer, p_status text, p_so text DEFAULT NULL::text, p_note text DEFAULT NULL::text, p_date date DEFAULT NULL::date)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare o orders; chk jsonb; msg text;
begin
  if not is_sales() then raise exception 'Only Sales or an Admin can change orders'; end if;
  if p_status not in ('pending','shipped','cancelled','submitted') then raise exception 'Unknown status %', p_status; end if;
  select * into o from orders where id = p_id for update;
  if o.id is null then raise exception 'Order not found'; end if;
  -- 223: cancelling cleans up the load and the truck first, or says what has to happen
  if p_status = 'cancelled' and o.status <> 'cancelled' then perform _cancel_order_guard(o); end if;
  if nullif(trim(p_so), '') is not null and exists (select 1 from orders where so_number = trim(p_so) and id <> p_id) then
    raise exception 'SO % is already on another order', trim(p_so);
  end if;
  if o.status = 'submitted' and p_status in ('pending', 'shipped') then
    perform pg_advisory_xact_lock(4242);       -- same lock as ordering: two confirms can't take the same lbs
    chk := order_stock_check(p_id);
    if not (chk ->> 'ok')::boolean then
      select string_agg(format('%s: %s lbs%s ordered, only %s available', x ->> 'strain', round((x ->> 'lbs')::numeric),
                               case when (x ->> 'hold')::numeric > 0 then ' + ' || round((x ->> 'hold')::numeric) || ' held' else '' end, round((x ->> 'available')::numeric)), '; ')
        into msg from jsonb_array_elements(chk -> 'short') x;
      raise exception 'Not enough to confirm. %. Change the lines or decline the order.', msg;
    end if;
  end if;
  update orders set status = p_status, so_number = coalesce(nullif(trim(p_so), ''), so_number),
         confirmed_by = case when o.status = 'submitted' and p_status = 'pending' then current_email() else confirmed_by end,
         confirmed_at = case when o.status = 'submitted' and p_status = 'pending' then now() else confirmed_at end,
         shipped_date = case when p_status = 'shipped' then coalesce(p_date, shipped_date, current_date) else shipped_date end,
         updated_at = now()
   where id = p_id;
  if p_status = 'cancelled' and o.status <> 'cancelled' then perform _cancel_order_after(o); end if;
  insert into events (user_email, type, note, details)
  values (current_email(), 'order_status', p_note, jsonb_build_object('order_id', p_id, 'from', o.status, 'to', p_status, 'date', p_date,
          'so', coalesce(nullif(trim(p_so), ''), o.so_number), 'customer', (select name from customers where id = o.customer_id)));
end $function$
;

CREATE OR REPLACE FUNCTION public.gvr_stage_list()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform require_staff();
  if not (is_owner() or mod_level('distribution') is not null or mod_level('compliance') is not null) then return jsonb_build_object('on', gvr_stage_on(), 'stages', '[]'::jsonb); end if;
  return jsonb_build_object('on', gvr_stage_on(), 'stages', coalesce((
    select jsonb_agg(x order by x.problem is null, x.ship_date, x.code) from (
      select g.id, g.pallet_id, p.code, c.name as customer, g.order_id, o.so_number as so, g.load_id, l.code as load, l.status as load_status, g.ship_date,
             g.stage_driver, g.license, m.manifest,
             -- another open load for the same customer that has it now (Use that load)
             (select jsonb_build_object('load_id', l3.id, 'load', l3.code) from load_items i3 join loads l3 on l3.id = i3.load_id join load_stops s3 on s3.id = i3.stop_id
               where i3.pallet_id = g.pallet_id and l3.status in ('planning', 'loading') and s3.customer_id = g.customer_id and i3.stop_id is distinct from g.stop_id limit 1) as other_load,
             case when o.status = 'cancelled' then 'Order ' || coalesce(o.so_number, '') || ' was cancelled: Move back to GVR, or put it on another order'
                  when g.order_id is not null and coalesce(o.status, '') <> 'shipped'
                       and coalesce((case when l.status in ('planning', 'loading', 'departing') and exists (select 1 from load_items i where i.load_id = g.load_id and i.pallet_id = g.pallet_id) then l.load_date end),
                                    (select l4.load_date from load_stops s4 join loads l4 on l4.id = s4.load_id where s4.id = o.stop_id and l4.status in ('planning', 'loading', 'departing')),
                                    o.wanted_date) > _local_today() + 2
                  then 'Not shipping till ' || to_char(coalesce((case when l.status in ('planning', 'loading', 'departing') and exists (select 1 from load_items i where i.load_id = g.load_id and i.pallet_id = g.pallet_id) then l.load_date end),
                                    (select l4.load_date from load_stops s4 join loads l4 on l4.id = s4.load_id where s4.id = o.stop_id and l4.status in ('planning', 'loading', 'departing')),
                                    o.wanted_date), 'Mon DD') || ' (more than 2 days): Move back to GVR'
                  when g.load_id is null and g.note like 'Came back%' then g.note || ': Move back to GVR, or put it on a load for ' || coalesce(c.name, 'the customer')
                  when m.manifest is null and g.created_at < now() - interval '10 minutes' then 'No METRC manifest from GVR yet: send its METRC to-do, or Move back to GVR'
                  when l.id is null or l.status = 'cancelled' then 'Its load ' || coalesce(l.code, '') || ' was cancelled'
                  when not exists (select 1 from load_items i where i.load_id = g.load_id and i.pallet_id = g.pallet_id) then 'Taken off ' || l.code
                  when l.status in ('planning', 'loading', 'departing') and l.load_date < _local_today() then 'Ship date ' || to_char(l.load_date, 'Mon DD') || ' passed: still at OHR'
                  when l.status in ('planning', 'loading') and l.load_date <= _local_today()
                       and nullif(trim(coalesce(case when l.kind = 'pickup' then l.pickup_driver else l.driver end, '')), '') is null then 'Ships today and ' || l.code || ' has no driver yet'
             end as problem
        from gvr_stages g join pallets p on p.id = g.pallet_id
        left join customers c on c.id = g.customer_id
        left join orders o on o.id = g.order_id
        left join loads l on l.id = g.load_id
        left join metrc_app_transfers m on m.key = 'stop:' || g.stop_id || ':' || g.license and m.state <> 'voided'
       where g.status = 'staged' and coalesce(l.status, '') not in ('in_transit', 'delivered')) x), '[]'::jsonb));
end $function$
;

CREATE OR REPLACE FUNCTION public.stop_alerts()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform require_staff_view();
  return coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from app_alerts a
    where a.done_at is null and a.kind in ('stop_outcome', 'stop_metrc', 'acct_flag', 'gvr_back')
      and (is_owner() or (case when a.admins then mod_level(a.module) = 'admin' else mod_level(a.module) is not null end)
           or (a.module = 'accounting' and jwt_email() = any(string_to_array(replace(coalesce((select value from app_settings where key = 'acct.alert_people'), ''), ' ', ''), ','))))), '[]'::jsonb);
end $function$
;

commit;
