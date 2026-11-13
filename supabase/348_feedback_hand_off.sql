-- 348_feedback_hand_off.sql  (Msg FB-12, 11/12)
-- Copying Claude briefs now hands the reports off: every picked report that's still open and not already
-- In progress (New, Needs info, Approved, Ready to test) moves to In progress, with a History line
-- "Handed to Claude (brief copied)". Done / Declined / Duplicate reports are copied but not moved.
-- The reporter gets no push for this. Additive: feedback_brief / feedback_briefs stay as they are.
-- Safe to run more than once.

begin;

create or replace function feedback_hand_off(p_ids bigint[]) returns text
language plpgsql security definer set search_path = public as $$
declare f record;
begin
  if not (is_feedback_triager() or _fb_is_service()) then raise exception 'Only triagers can do this'; end if;
  if not _fb_is_service() then perform no_view_as(); end if;
  for f in select id, status from feedback where id = any(p_ids)
             and status in ('new', 'needs_info', 'approved', 'ready_to_test') for update loop
    update feedback set status = 'in_progress', updated_at = now() where id = f.id;
    perform _fb_event(f.id, f.status, 'in_progress', 'Handed to Claude (brief copied)');
  end loop;
  return feedback_briefs(p_ids);
end $$;
revoke all on function feedback_hand_off(bigint[]) from public, anon;
grant execute on function feedback_hand_off(bigint[]) to authenticated;

commit;
