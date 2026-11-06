-- 222: Coming back on our trucks showed a mixed pallet at 0 lbs (M13, Lazer Buddha, Msg #265). A mixed pallet is just the
-- holder: its weight is the packages on it. Coming back now shows the packages' total (and how many), and the
-- "returned back" activity line logs that total too. Safe to re-run.
begin;

CREATE OR REPLACE FUNCTION public.returns_coming_back()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform require_staff_view();
  if not (is_owner() or mod_level('distribution') is not null) then return '[]'::jsonb; end if;
  return coalesce((select jsonb_agg(x order by x.outcome_at, x.load, x.seq, x.code) from (
    select r.id, r.stop_id, r.load_id, l.code as load, l.status as load_status, s.seq, c.name as customer, s.outcome, s.outcome_reason, s.outcome_at,
           s.manifest, r.kind, r.reason, r.note, p.id as pallet_id, p.code, upper(p.package_tag) as tag, p.strain, case when p.kind = 'mixed' then (select coalesce(sum(k.current_weight), 0) from pallets k where k.container_id = p.id) else p.current_weight end as lbs,
           case when p.kind = 'mixed' then (select count(*) from pallets k where k.container_id = p.id) end as pkgs,
           (select metrc_name from items where id = p.item_id) as item,
           coalesce((select i.from_site from load_items i where i.stop_id = r.stop_id and i.pallet_id = r.top_id limit 1), pallet_site(p)) as from_site,
           exists (select 1 from gvr_stages g where g.pallet_id = r.top_id and g.load_id = r.load_id and g.status = 'shipped') as staged
      from stop_returns r join load_stops s on s.id = r.stop_id join loads l on l.id = r.load_id
      join customers c on c.id = s.customer_id join pallets p on p.id = r.pallet_id
     where r.back_at is null and r.cancelled_at is null) x), '[]'::jsonb);
end $function$
;

CREATE OR REPLACE FUNCTION public.receive_returns(p_ids bigint[], p_site text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare r record; st text := upper(trim(coalesce(p_site, ''))); n int := 0; g gvr_stages; restaged int := 0; sids int[] := '{}'; sid int; o record; ready int := 0;
begin
  perform require_distribution();
  perform no_view_as();
  if st not in ('OHR', 'GVR') then raise exception 'Receive at OHR or GVR'; end if;
  for r in select x.*, l.code as load, c.name as customer, s.outcome_reason from stop_returns x join loads l on l.id = x.load_id
             join load_stops s on s.id = x.stop_id join customers c on c.id = s.customer_id
            where x.id = any(p_ids) and x.back_at is null and x.cancelled_at is null for update of x loop
    select * into g from gvr_stages where pallet_id = r.top_id and load_id = r.load_id and status = 'shipped' order by id desc limit 1;
    update pallets set status = 'unslotted', slot_id = null, received_site = st, updated_at = now()
     where (id = r.pallet_id or container_id = r.pallet_id) and status = 'in_transit';
    update stop_returns set back_at = now(), back_by = current_email(), back_site = st where id = r.id;
    insert into events (user_email, type, pallet_id, load_id, lbs, details)
    values (current_email(), 'returned_back', r.pallet_id, r.load_id, (select case when x.kind = 'mixed' then (select coalesce(sum(k.current_weight), 0) from pallets k where k.container_id = x.id) else x.current_weight end from pallets x where x.id = r.pallet_id),
            jsonb_build_object('load', r.load, 'customer', r.customer, 'site', st, 'kind', r.kind, 'reason', r.reason, 'note', r.note));
    if g.id is not null and st = 'OHR' then
      insert into gvr_stages (pallet_id, order_id, customer_id, license, ship_date, status, note)
      values (r.pallet_id, case when r.outcome_reason in ('rescheduled', 'couldnt_deliver') then g.order_id end, g.customer_id, g.license, _local_today(), 'staged',
              'Came back from ' || r.load || ' (' || case when r.kind = 'rejected' then 'rejected' else 'not delivered' end || ')')
      on conflict do nothing;
      restaged := restaged + 1;
    end if;
    if not r.stop_id = any(sids) then sids := sids || r.stop_id; end if;
    n := n + 1;
  end loop;
  if n = 0 then raise exception 'Nothing to receive (already received?)'; end if;
  -- rescheduled stops with nothing left on the truck: their orders go back to Ready (same pallets, same invoice)
  foreach sid in array sids loop
    if exists (select 1 from load_stops s where s.id = sid and s.outcome = 'not_delivered' and s.outcome_reason in ('rescheduled', 'couldnt_deliver'))
       and not exists (select 1 from stop_returns x where x.stop_id = sid and x.back_at is null and x.cancelled_at is null) then
      for o in select od.id, od.so_number, l.code from orders od join load_stops s on s.id = od.stop_id join loads l on l.id = s.load_id
                where od.stop_id = sid and od.status in ('shipped', 'pending') loop
        update orders set status = 'pending', stop_id = null, shipped_date = null, updated_at = now() where id = o.id;
        insert into events (user_email, type, details) values (current_email(), 'order_back_ready',
          jsonb_build_object('order_id', o.id, 'so', o.so_number, 'load', o.code, 'why', 'not delivered (rescheduled / couldn''t deliver), received back'));
        ready := ready + 1;
      end loop;
    end if;
  end loop;
  -- 218: fully rejected, or not delivered because the customer cancelled: the order is cancelled once it's all back
  -- (its holds come off; the lbs go back to the customer's reserve)
  foreach sid in array sids loop
    if exists (select 1 from load_stops s where s.id = sid and (s.outcome = 'fully_rejected' or (s.outcome = 'not_delivered' and s.outcome_reason = 'cancelled')))
       and not exists (select 1 from stop_returns x where x.stop_id = sid and x.back_at is null and x.cancelled_at is null) then
      for o in select od.id, od.so_number, l.code from orders od join load_stops s on s.id = od.stop_id join loads l on l.id = s.load_id
                where od.stop_id = sid and od.status in ('shipped', 'pending') loop
        update orders set status = 'cancelled', updated_at = now() where id = o.id;
        insert into events (user_email, type, details) values (current_email(), 'order_cancelled',
          jsonb_build_object('order_id', o.id, 'so', o.so_number, 'load', o.code, 'why', 'rejected / cancelled at the stop, received back'));
      end loop;
    end if;
  end loop;
  -- 221: a Not delivered stop with everything back: its customer manifest gets voided in METRC (to-do kind manifest_void:
  -- Compliance > METRC > Settings decides Off / Approve / Auto). Rejected stops aren't voided: the customer rejects them.
  foreach sid in array sids loop
    perform _manifest_void_todo(sid);
  end loop;
  update app_alerts a set done_at = now(), done_by = current_email()
   where a.done_at is null and a.kind = 'stop_outcome' and a.module = 'sales'
     and (a.ref ->> 'stop_id')::int = any(sids)
     and not exists (select 1 from stop_returns x where x.stop_id = (a.ref ->> 'stop_id')::int and x.back_at is null and x.cancelled_at is null);
  return jsonb_build_object('received', n, 'restaged', restaged, 'ready', ready);
end $function$
;

commit;
