-- 297: Distribution Admins get Delivery problems too (Aziz 11/6, Msg #297).
--  * A delivery problem (stop recorded not delivered, rejected, partly rejected...) already alerts Sales and Owners. Now every
--    Distribution Admin gets the same push and sees it in the Transit alerts box, on top of anyone added in
--    Admin > Settings > Alerts. The Accounting "credit memo may be needed" copy is unchanged.
--  * Each person can still turn the Delivery problems type off in My settings > Notifications.
--  * Only changes _alert_notify, stop_alerts and the Alerts settings label. Built on the live versions from 224 and 230.
-- RUN LIVE 11/6 by Claude in the SQL Editor. Safe to re-run.
begin;

CREATE OR REPLACE FUNCTION public._alert_notify()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare who text[]; url text := (select value from app_settings where key = 'app.url');
begin
  select array_agg(distinct e) into who from (
    select m.email as e from module_access m where m.module = new.module and (not new.admins or m.level = 'admin')
    union select m.email from module_access m where new.kind = 'stop_outcome' and new.module = 'sales' and m.module = 'distribution' and m.level = 'admin'
    union select u.email from app_users u where u.owner and new.kind like 'stop_%'
    union select lower(trim(v)) from unnest(string_to_array(coalesce((select value from app_settings where key = 'acct.alert_people'), ''), ',')) v
           where new.module = 'accounting' and trim(v) <> ''
    union select unnest(_alert_people(new.kind))) x;
  if who is not null then perform _notify(who, new.title, new.body, url, new.kind, new.ref); end if;
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
    where a.done_at is null and a.kind in ('stop_outcome', 'stop_metrc', 'acct_flag', 'gvr_back', 'reserve_back', 'stop_unrecorded')
      and (is_owner() or (case when a.admins then mod_level(a.module) = 'admin' else mod_level(a.module) is not null end)
           or jwt_email() = any(_alert_people(a.kind))
           or (a.kind = 'stop_outcome' and a.module = 'sales' and mod_level('distribution') = 'admin')
           or (a.module = 'accounting' and jwt_email() = any(string_to_array(replace(coalesce((select value from app_settings where key = 'acct.alert_people'), ''), ' ', ''), ','))))), '[]'::jsonb);
end $function$
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
            from (values (1, 'stop_outcome', 'Delivery problems', 'Sales and Distribution Admins (and Owners)'),
                         (2, 'stop_metrc', 'METRC follow-ups (manifests to void, rejections to check)', 'Distribution Admins (and Owners)'),
                         (3, 'gvr_back', 'Move back to GVR (staged at OHR, order cancelled or not shipping within 2 days)', 'Distribution'),
                         (4, 'reserve_back', 'Rejected lbs back on a reserve', 'Sales'),
                         (4, 'stop_unrecorded', 'Carrier stops not recorded by end of day', 'Distribution'),
                         (5, 'acct_flag', 'Accounting flags (credit memo needed)', 'Accounting')) x(ord, k, lbl, whom));
end $function$
;

commit;
