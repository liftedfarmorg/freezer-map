-- 168: the nightly METRC pull was running out of time before the farm licenses (found 11/3).
-- The fix is mostly in api/metrc/sync.js (farms first, licenses already pulled in the window are skipped, steps that run out of
-- time leave the run not complete, extra cron slots in vercel.json). This file:
--  * metrc_sync_status(): also gives the last try (time, finished or not, what didn't finish) and when METRC's items were
--    last pulled and how many, for Compliance > METRC > Reconcile.
--  * metrc_alert_list(): who gets the "METRC pull problems" email (My settings, off unless turned on). Server only.
--  * Turns it on for Aziz.
-- Safe to re-run.
begin;

drop function if exists metrc_sync_status();
create or replace function metrc_sync_status()
returns table (license text, site text, last_pull timestamptz, complete boolean, active int, error text,
               last_try timestamptz, last_try_note text, items int, items_at timestamptz)
language sql stable security definer set search_path = public as $$
  select l.license_no, l.site,
         (select max(r.finished_at) from metrc_sync_runs r where r.license = l.license_no and r.complete),
         coalesce((select r.complete from metrc_sync_runs r where r.license = l.license_no order by r.id desc limit 1), false),
         (select count(*)::int from metrc_packages m where m.license = l.license_no and m.state in ('active', 'intransit')),
         (select r.error from metrc_sync_runs r where r.license = l.license_no order by r.id desc limit 1),
         (select r.started_at from metrc_sync_runs r where r.license = l.license_no order by r.id desc limit 1),
         (select (select string_agg(x, '; ') from jsonb_array_elements_text(coalesce(r.counts -> 'notes', '[]'::jsonb)) x)
            from metrc_sync_runs r where r.license = l.license_no order by r.id desc limit 1),
         (select count(*)::int from metrc_items i where i.license = l.license_no and not i.archived),
         (select s.updated_at from metrc_sync_state s where s.license = l.license_no and s.step = 'setup')
    from licenses l where l.active and l.site is not null and l.kind <> 'transport' and comp_can_read()
   order by l.site, l.license_no
$$;
revoke all on function metrc_sync_status() from public, anon;
grant execute on function metrc_sync_status() to authenticated;

-- "METRC pull problems" email: only people who turned it on (default off)
create or replace function metrc_alert_list() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(u.email), '[]') from app_users u
   where u.role in ('admin','sales','crew') and coalesce((u.prefs -> 'notify' ->> 'metrc_pull')::boolean, false)
$$;
revoke all on function metrc_alert_list() from public, anon, authenticated;
grant execute on function metrc_alert_list() to service_role;

update app_users
   set prefs = coalesce(prefs, '{}'::jsonb) || jsonb_build_object('notify', coalesce(prefs -> 'notify', '{}'::jsonb) || '{"metrc_pull": true}'::jsonb),
       updated_at = now()
 where lower(email) = 'aziz@lifted-organics.com';

commit;
