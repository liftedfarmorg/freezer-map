-- 221: Void the customer manifest in METRC once a Not delivered stop's product is received back (Msg #262-263, Aziz 11/5:
-- "build it, go live tomorrow"). Plan: change-order-decisions-251.md (answer 8).
--  * Receive back (Distribution > Inbound > Coming back on our trucks) puts the pallets in Needs a spot, takes the order off
--    the load (Ready again for rescheduled / couldn't deliver; cancelled for customer cancelled), and, once everything from
--    the stop is back, adds a METRC to-do "Void manifest ..." (kind manifest_void).
--  * Compliance > METRC > Settings: "Void customer manifests (not delivered, received back)" Off / Approve / Auto.
--    Starts on Approve: Rama approves it in the METRC queue and the app voids it through T3 (Dry run first if Live is off).
--  * The METRC id: the app's own manifest, or for one made by hand (Lazer Buddha 0011828178) the METRC pull by number.
--  * If METRC says it was already received or voided, the to-do says so and Rama sorts it by hand. Rejected stops: no void.
-- Safe to re-run.
begin;

alter table load_stops add column if not exists manifest_voided_at timestamptz;

insert into metrc_push_kinds (kind, label, phase, sort, ready, mode) values
  ('manifest_void', 'Void customer manifests (not delivered, received back)', 1, 72, true, 'approve')
on conflict (kind) do update set label = excluded.label, sort = excluded.sort, ready = true;

-- the to-do for one stop (once, when everything is back, if it had a manifest)
create or replace function _manifest_void_todo(p_stop int) returns bigint
language plpgsql security definer set search_path = public as $$
declare s load_stops; l loads; c customers; lic text; n int; id_ bigint;
begin
  select * into s from load_stops where id = p_stop;
  if s.id is null or s.outcome is distinct from 'not_delivered' or nullif(trim(coalesce(s.manifest, '')), '') is null or s.manifest_voided_at is not null then return null; end if;
  if exists (select 1 from stop_returns r where r.stop_id = s.id and r.back_at is null and r.cancelled_at is null) then return null; end if;
  if exists (select 1 from comp_metrc_actions a where a.kind = 'manifest_void' and a.details ->> 'stop_id' = s.id::text and a.status in ('todo', 'error', 'done')) then return null; end if;
  select * into l from loads where id = s.load_id;
  select * into c from customers where id = s.customer_id;
  select k.from_license, count(*) over () into lic, n from _stop_leaves(s.id) k where k.from_license is not null limit 1;
  insert into comp_metrc_actions (at, license, action, summary, details, kind)
  values (now(), lic, 'Void manifest ' || trim(s.manifest) || ' to ' || c.name || ' (not delivered, received back)',
          concat_ws(' · ', l.code, 'stop ' || s.seq, replace(coalesce(s.outcome_reason, ''), '_', ' '), s.outcome_note),
          jsonb_build_object('type', 'manifest_void', 'stop_id', s.id, 'load_id', l.id, 'load', l.code, 'customer', c.name, 'to_license', c.license,
                             'manifest', trim(s.manifest), 'packages', n, 'by', current_email()),
          'manifest_void')
  returning id into id_;
  return id_;
end $$;
revoke all on function _manifest_void_todo(int) from public, anon, authenticated;

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
    values (current_email(), 'returned_back', r.pallet_id, r.load_id, (select current_weight from pallets where id = r.pallet_id),
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
