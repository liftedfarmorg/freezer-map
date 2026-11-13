-- 347_feedback_closed_push_test_push.sql  (Msg FB-11, 11/12)
--   1. The reporter gets a push when their report is marked Done or Declined by someone else
--      (not when they tap Works now themselves). Kind feedback_closed; tapping it opens the report.
--   2. feedback_briefs: the Claude brief for many reports at once (Copy Claude briefs on picked rows).
--   3. send_test_push / push_test_result: "Send me a test push" in My settings, and whether it reached Apple/Google.
-- Safe to run more than once.

begin;

-- =====================================================================================================
-- 1. Done / Declined -> push to the reporter
-- =====================================================================================================
create or replace function _fb_closed_push() returns trigger
language plpgsql security definer set search_path = public as $$
declare f feedback; url text := (select value from app_settings where key = 'app.url');
begin
  if new.to_status not in ('done', 'declined') or new.from_status is not distinct from new.to_status then return new; end if;
  select * into f from feedback where id = new.feedback_id;
  if f.id is null or f.reporter_email is null or f.reporter_email = coalesce(new.actor_email, '') then return new; end if;
  perform _notify(array[f.reporter_email],
    f.ref || case when new.to_status = 'done' then ' is done' else ' was declined' end,
    case when new.to_status = 'done'
         then coalesce(f.title, left(f.details, 120)) || coalesce(' · ' || nullif(trim(new.note), ''), '')
         else coalesce(nullif(trim(f.decision_note), ''), coalesce(f.title, left(f.details, 120))) end,
    coalesce(url, '') || '?fb=' || f.id, 'feedback_closed', jsonb_build_object('feedback_id', f.id));
  return new;
end $$;
revoke all on function _fb_closed_push() from public, anon, authenticated;

drop trigger if exists feedback_closed_push on feedback_events;
create trigger feedback_closed_push after insert on feedback_events for each row execute function _fb_closed_push();

-- =====================================================================================================
-- 2. many Claude briefs in one go, in the order given
-- =====================================================================================================
create or replace function feedback_briefs(p_ids bigint[]) returns text
language plpgsql stable security definer set search_path = public as $$
declare v_out text; n int;
begin
  if not (is_feedback_triager() or _fb_is_service()) then raise exception 'Only triagers can do this'; end if;
  select count(*) into n from unnest(p_ids) i join feedback f on f.id = i;
  if n = 0 then raise exception 'Pick at least one report'; end if;
  select string_agg(feedback_brief(f.id), E'\n\n---\n\n' order by x.ord) into v_out
    from unnest(p_ids) with ordinality x(id, ord) join feedback f on f.id = x.id;
  return '# Feedback & Bugs: ' || n || case when n = 1 then ' report' else ' reports' end || ' for Claude (Lifted ops app)' || E'\n\n'
      || 'Work through these one at a time. Build "Aziz''s version" where there is one, otherwise their words. '
      || 'When one is built, set it Ready to test with notes on what changed and how to test it.' || E'\n\n---\n\n' || v_out;
end $$;
revoke all on function feedback_briefs(bigint[]) from public, anon;
grant execute on function feedback_briefs(bigint[]) to authenticated;

-- =====================================================================================================
-- 3. test push to every device of the person signed in (not who they're viewing as)
-- =====================================================================================================
create or replace function send_test_push() returns jsonb
language plpgsql security definer set search_path = public as $$
declare e text := real_email(); n int; v_id bigint;
begin
  if nullif(e, '') is null or not exists (select 1 from app_users where email = e) then raise exception 'Sign in first'; end if;
  select count(*) into n from push_subs where email = e;
  if n = 0 then raise exception 'No phone or computer is set up for notifications yet. Tap Turn on notifications first (on iPhone, from the Lifted app on the Home Screen).'; end if;
  insert into push_outbox (email, title, body, url, tag, kind)
  values (e, 'Test from Lifted', 'Notifications work on this device.', (select value from app_settings where key = 'app.url'),
          'test:' || extract(epoch from clock_timestamp())::bigint, 'test')
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'devices', n);
end $$;

create or replace function push_test_result(p_id bigint) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('sent', o.sent_at is not null, 'tries', o.tries, 'error', o.error)
    from push_outbox o where o.id = p_id and o.email = real_email() and o.kind = 'test'
$$;
revoke all on function send_test_push(), push_test_result(bigint) from public, anon;
grant execute on function send_test_push(), push_test_result(bigint) to authenticated;

commit;
