-- 351_feedback_stale_in_progress.sql  (Msg FB-13, 11/12)
-- Aziz: a report that sits In progress with nothing happening goes back to Approved on its own.
-- feedback_stale_sweep() runs with every notify run (api/notify/run.js, every minute). A report moves back when it has
-- been In progress for 3 days (app_settings feedback.stale_days) with no change, comment or History line in that time.
-- History gets "Back to Approved: In progress 3 days with nothing built". No push to anyone.
-- Safe to run more than once.

begin;

insert into app_settings values ('feedback.stale_days', '3') on conflict (key) do nothing;

create or replace function feedback_stale_sweep() returns int
language plpgsql security definer set search_path = public as $$
declare days int; f record; n int := 0;
begin
  if not _fb_is_service() then raise exception 'Runs on its own'; end if;
  select coalesce(nullif(value, '')::int, 3) into days from app_settings where key = 'feedback.stale_days';
  days := coalesce(days, 3);
  for f in
    select fb.id from feedback fb
     where fb.status = 'in_progress'
       and greatest(fb.updated_at,
                    coalesce((select max(e.created_at) from feedback_events e where e.feedback_id = fb.id), fb.updated_at),
                    coalesce((select max(c.created_at) from feedback_comments c where c.feedback_id = fb.id), fb.updated_at))
           < now() - make_interval(days => days)
     for update of fb skip locked
  loop
    update feedback set status = 'approved', updated_at = now() where id = f.id;
    perform _fb_event(f.id, 'in_progress', 'approved', 'Back to Approved: In progress ' || days || ' days with nothing built');
    n := n + 1;
  end loop;
  return n;
end $$;
revoke all on function feedback_stale_sweep() from public, anon, authenticated;
grant execute on function feedback_stale_sweep() to service_role;

commit;
