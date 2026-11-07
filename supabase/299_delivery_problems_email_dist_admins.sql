-- 299: Distribution Admins also get the email copy of Delivery problems (Aziz 11/7, Msg #299). Sales already gets one from
--   _stop_outcome; anyone who is in both is only emailed once. Emails send once the email sender (CCI) is on.
-- Only changes _alert_notify (built on 297). Keep this clause in any later _alert_notify.
-- RUN LIVE 11/7 by Claude in the SQL Editor. Safe to re-run.
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
  -- Distribution Admins also get the email copy of a delivery problem (Sales already gets one from _stop_outcome)
  if new.kind = 'stop_outcome' and new.module = 'sales' then
    insert into email_outbox (to_email, subject, body, kind, ref)
    select distinct m.email, new.title, new.body, 'stop_outcome', new.ref
      from module_access m
     where m.module = 'distribution' and m.level = 'admin'
       and not exists (select 1 from module_access s join app_users au on au.email = s.email
                        where s.email = m.email and s.module = 'sales' and au.role in ('admin', 'sales', 'crew'));
  end if;
  return null;
end $function$
;

commit;
