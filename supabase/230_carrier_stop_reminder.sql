-- 230: End-of-day reminder for carrier stops nobody recorded (Aziz 11/6, Msg #278-279).
--  * From 6pm Pacific (setting alerts.unrecorded_at, HH:MM), any stop on an outside carrier's load (G & R, R & M, Reefer
--    Trucking...) that's on the road, dated today or earlier, with no outcome yet sends Distribution one push per stop per
--    day: "Carrier stop not recorded: <customer> on L-xxx". Open the load in Transit > Record outcome.
--  * Runs from the every-minute sender. Shows in the Transit alerts box until Done. Notification type: Delivery problems.
--  * Admin > Settings > Alerts: new row "Carrier stops not recorded by end of day" to add people. Safe to re-run.
begin;

insert into app_settings (key, value) values ('alerts.unrecorded_at', '18:00') on conflict (key) do nothing;

create or replace function stop_unrecorded_sweep() returns int
language plpgsql security definer set search_path = public as $$
declare s record; n int := 0; at_t time;
begin
  at_t := coalesce(nullif(trim((select value from app_settings where key = 'alerts.unrecorded_at')), '')::time, '18:00');
  if (now() at time zone 'America/Los_Angeles')::time < at_t then return 0; end if;
  for s in select st.id, st.seq, l.id as load_id, l.code, l.load_date, c.name as customer, coalesce(fc.name, fc2.name) as carrier
             from load_stops st join loads l on l.id = st.load_id join customers c on c.id = st.customer_id
             left join fleet_assets fa on fa.id = l.vehicle_id left join fleet_carriers fc on fc.id = fa.carrier_id
             left join fleet_drivers fd on fd.id = l.driver_id left join fleet_carriers fc2 on fc2.id = fd.carrier_id
            where l.status = 'in_transit' and st.status = 'pending' and st.outcome is null and l.load_date <= _local_today()
              and coalesce(l.kind, '') <> 'pickup' and (fa.carrier_id is not null or fd.carrier_id is not null) loop
    continue when exists (select 1 from app_alerts a where a.kind = 'stop_unrecorded' and a.ref ->> 'stop_id' = s.id::text
                            and (a.created_at at time zone 'America/Los_Angeles')::date = _local_today());
    perform _alert('distribution', false, 'stop_unrecorded', 'Carrier stop not recorded: ' || s.customer || ' on ' || s.code,
      coalesce(s.carrier, 'The carrier') || ' hasn''t recorded stop ' || s.seq || ' (' || s.customer || ', ' || to_char(s.load_date, 'Mon DD') || ') on the driver link. '
      || 'Call them, then Transit > ' || s.code || ' > Record outcome.',
      jsonb_build_object('stop_id', s.id, 'load_id', s.load_id));
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function stop_unrecorded_sweep() from public, anon, authenticated;
grant execute on function stop_unrecorded_sweep() to service_role;

CREATE OR REPLACE FUNCTION public.stop_alerts()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform require_staff_view();
  return coalesce((select jsonb_agg(to_jsonb(a) order by a.created_at desc) from app_alerts a
    where a.done_at is null and a.kind in ('stop_outcome', 'stop_metrc', 'acct_flag', 'gvr_back', 'reserve_back', 'stop_unrecorded')
      and (is_owner() or (case when a.admins then mod_level(a.module) = 'admin' else mod_level(a.module) is not null end)
           or jwt_email() = any(_alert_people(a.kind))
           or (a.module = 'accounting' and jwt_email() = any(string_to_array(replace(coalesce((select value from app_settings where key = 'acct.alert_people'), ''), ' ', ''), ','))))), '[]'::jsonb);
end $function$
;

CREATE OR REPLACE FUNCTION public._notify_type(p_kind text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select case when p_kind in ('stop_outcome', 'reserve_back', 'stop_unrecorded') then 't_delivery' when p_kind = 'stop_metrc' then 't_metrc'
              when p_kind = 'driver_load' then 't_load_assigned' when p_kind = 'driver_depart' then 't_load_left' when p_kind = 'gvr_back' then 't_staging' when p_kind = 'acct_flag' then 't_acct' else 't_other' end
$function$
;

CREATE OR REPLACE FUNCTION public.alert_people_list()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  perform require_staff_view();
  if not (is_owner() or mod_level('admin') = 'admin' or exists (select 1 from app_users where email = jwt_email() and role = 'admin')) then return '[]'::jsonb; end if;
  return (select jsonb_agg(jsonb_build_object('kind', k, 'label', lbl, 'who', whom, 'people', array_to_string(_alert_people(k), ', ')) order by ord)
            from (values (1, 'stop_outcome', 'Delivery problems', 'Sales (and Owners)'),
                         (2, 'stop_metrc', 'METRC follow-ups (manifests to void, rejections to check)', 'Distribution Admins (and Owners)'),
                         (3, 'gvr_back', 'Move back to GVR (staged at OHR, order cancelled or not shipping within 2 days)', 'Distribution'),
                         (4, 'reserve_back', 'Rejected lbs back on a reserve', 'Sales'),
                         (4, 'stop_unrecorded', 'Carrier stops not recorded by end of day', 'Distribution'),
                         (5, 'acct_flag', 'Accounting flags (credit memo needed)', 'Accounting')) x(ord, k, lbl, whom));
end $function$
;

CREATE OR REPLACE FUNCTION public.set_alert_people(p_kind text, p_emails text)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v text;
begin
  perform no_view_as();
  if not (is_owner() or exists (select 1 from app_users where email = jwt_email() and role = 'admin')
          or (p_kind = 'acct_flag' and mod_level('accounting') = 'admin')) then raise exception 'Only Owners and Admins'; end if;
  if p_kind not in ('stop_outcome', 'stop_metrc', 'gvr_back', 'reserve_back', 'stop_unrecorded', 'acct_flag') then raise exception 'Unknown alert type'; end if;
  v := (select string_agg(distinct lower(trim(e)), ',') from unnest(string_to_array(replace(coalesce(p_emails, ''), ';', ','), ',')) e where trim(e) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');
  insert into app_settings (key, value) values (case when p_kind = 'acct_flag' then 'acct.alert_people' else 'alerts.people.' || p_kind end, coalesce(v, ''))
  on conflict (key) do update set value = excluded.value;
  return coalesce(v, '');
end $function$
;

commit;
