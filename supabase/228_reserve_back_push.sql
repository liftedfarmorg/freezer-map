-- 228: Sales gets a push when rejected lbs go back on a customer's reserve (Aziz 11/6, Msg #277).
--  * When a stop is recorded Partly rejected, Sales (everyone in the Sales module, plus anyone added in Admin > Settings >
--    Alerts, new row "Rejected lbs back on a reserve") gets "Customer: Strain 300 lbs back on their reserve", so they can lower the reserve by hand if needed.
--  * It also shows in the Delivery alerts box on the Sales dashboard until someone hits Done.
--  * Notification type: Delivery problems (each person can turn it off in My settings). Safe to re-run.
begin;

CREATE OR REPLACE FUNCTION public._stop_reserve_back_event()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare ln jsonb; c customers; l loads;
begin
  if new.outcome is not distinct from old.outcome and new.outcome_at is not distinct from old.outcome_at then return null; end if;
  if new.outcome is distinct from 'partly_rejected' and old.outcome is distinct from 'partly_rejected' then return null; end if;
  select * into c from customers where id = new.customer_id;
  select * into l from loads where id = new.load_id;
  select jsonb_agg(jsonb_build_object('strain', k.strain, 'crop_year', k.crop_year, 'lbs', k.lbs) order by k.strain) into ln from _stop_rejected_lines(new.id) k;
  if new.outcome = 'partly_rejected' and ln is not null then
    insert into events (user_email, type, load_id, lbs, details)
    values (current_email(), 'reserve_back', l.id, (select sum((x ->> 'lbs')::numeric) from jsonb_array_elements(ln) x),
            jsonb_build_object('customer_id', c.id, 'customer', c.name, 'load', l.code, 'seq', new.seq, 'stop_id', new.id, 'manifest', new.manifest,
                               'so', (select string_agg(distinct o.so_number, ', ') from orders o where o.stop_id = new.id), 'lines', ln));
    -- 228: Sales gets an alert (push) so they can lower the reserve if the customer shouldn't get the lbs back
    perform _alert('sales', false, 'reserve_back', c.name || ': ' || (select string_agg((x ->> 'strain') || ' ' || round((x ->> 'lbs')::numeric) || ' lbs', ', ') from jsonb_array_elements(ln) x) || ' back on their reserve',
      'Rejected at delivery on ' || coalesce((select string_agg(distinct o.so_number, ', ') from orders o where o.stop_id = new.id), 'their order') || ' (' || l.code || ' stop ' || new.seq || '). '
      || 'It''s back on their reserve. Lower the reserve in Sales > Reserves if they shouldn''t get it back.',
      jsonb_build_object('stop_id', new.id, 'load_id', l.id, 'customer_id', c.id));
  elsif old.outcome = 'partly_rejected' and new.outcome is distinct from 'partly_rejected' then
    insert into events (user_email, type, load_id, details)
    values (current_email(), 'reserve_back_undone', l.id, jsonb_build_object('customer_id', c.id, 'customer', c.name, 'load', l.code, 'seq', new.seq,
            'stop_id', new.id, 'now', new.outcome));
  end if;
  return null;
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
    where a.done_at is null and a.kind in ('stop_outcome', 'stop_metrc', 'acct_flag', 'gvr_back', 'reserve_back')
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
  select case when p_kind in ('stop_outcome', 'reserve_back') then 't_delivery' when p_kind = 'stop_metrc' then 't_metrc'
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
  if p_kind not in ('stop_outcome', 'stop_metrc', 'gvr_back', 'reserve_back', 'acct_flag') then raise exception 'Unknown alert type'; end if;
  v := (select string_agg(distinct lower(trim(e)), ',') from unnest(string_to_array(replace(coalesce(p_emails, ''), ';', ','), ',')) e where trim(e) ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$');
  insert into app_settings (key, value) values (case when p_kind = 'acct_flag' then 'acct.alert_people' else 'alerts.people.' || p_kind end, coalesce(v, ''))
  on conflict (key) do update set value = excluded.value;
  return coalesce(v, '');
end $function$
;

commit;
