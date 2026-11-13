-- 346_feedback_finish_delete.sql  (Msg FB-10, 11/12)
-- Feedback & Bugs inbox:
--   1. delete_feedback: a triager deletes a report for good (comments, history and picture rows go with it).
--      The app removes the pictures from the feedback bucket first, then calls this.
--      A copy of the report is kept in events (type feedback_deleted) so there's a trail.
--   2. Push fix: every Feedback & Bugs push had the same tag ("feedback_new:"). On an iPhone a push with the same
--      tag as one already in Notification Center replaces it quietly, with no banner or sound. Now the tag includes
--      the report number, so each report shows up as its own alert.
-- "Done" from any open status needs no SQL (triage_feedback already allows it); the app now shows the button.
-- Safe to run more than once.

begin;

-- =====================================================================================================
-- 1. delete a report
-- =====================================================================================================
create or replace function delete_feedback(p_id bigint, p_reason text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare f feedback;
begin
  if not (is_feedback_triager() or _fb_is_service()) then raise exception 'Only triagers can delete reports'; end if;
  if not _fb_is_service() then perform no_view_as(); end if;
  select * into f from feedback where id = p_id for update;
  if f.id is null then raise exception 'No such report'; end if;

  insert into events (user_email, type, note, details)
  values (coalesce(nullif(real_email(), ''), 'claude'), 'feedback_deleted', f.ref,
          jsonb_build_object('reason', nullif(trim(coalesce(p_reason, '')), ''), 'report', to_jsonb(f),
            'comments', (select coalesce(jsonb_agg(to_jsonb(c) order by c.id), '[]') from feedback_comments c where c.feedback_id = p_id),
            'files', (select coalesce(jsonb_agg(file_path order by id), '[]') from feedback_files where feedback_id = p_id)));

  update feedback set duplicate_of = null, updated_at = now() where duplicate_of = p_id;   -- reports that pointed at it
  delete from feedback where id = p_id;                                                     -- comments, events, files cascade
  return jsonb_build_object('ok', true, 'ref', f.ref);
end $$;
revoke all on function delete_feedback(bigint, text) from public, anon;
grant execute on function delete_feedback(bigint, text) to authenticated;

-- =====================================================================================================
-- 2. push tag: one per report (patch the live _notify in place, keeping everything else as it is)
-- =====================================================================================================
do $$
declare d text; d2 text;
begin
  select pg_get_functiondef('_notify(text[],text,text,text,text,jsonb)'::regprocedure) into d;
  if d like '%p_ref ->> ''feedback_id''%' then return; end if;   -- already done
  d2 := replace(d, 'coalesce(p_ref ->> ''stop_id''', 'coalesce(p_ref ->> ''feedback_id'', p_ref ->> ''stop_id''');
  if d2 = d then raise exception '346: couldn''t find the push tag in _notify, nothing changed'; end if;
  execute d2;
end $$;

commit;
