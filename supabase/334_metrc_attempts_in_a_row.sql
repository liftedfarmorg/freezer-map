-- 334 (Msg NAPA-6, 11/11): a METRC send's attempt count = failures IN A ROW.
-- Before: "waiting" only took 1 off the count, so a long harvest (Napa #1038, 119,300 plants) piled up failures over
-- hundreds of rounds, hit 10, and auto retry (needs fewer than 3) stopped for good after one more METRC error.
-- Now any round that isn't a failure (checked, waiting, held) puts the count back to 0.
-- Also puts #1038 back to 0 attempts so auto retry picks it up again (it reads METRC's count first: no plant twice).

create or replace function metrc_result(p_id bigint, p_state text, p_by text, p_request jsonb, p_response jsonb, p_error text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if p_state not in ('checked', 'sent', 'failed', 'waiting', 'held') then raise exception 'Bad state'; end if;
  update comp_metrc_actions set
    push_state = p_state, push_by = p_by, push_at = now(),
    push_request = coalesce(p_request, push_request),
    push_response = case
      when p_response is null then push_response
      when push_response ? 'progress' and not (case when jsonb_typeof(p_response) = 'object' then p_response ? 'progress' else false end)
        then (case when jsonb_typeof(p_response) = 'object' then p_response else jsonb_build_object('body', p_response) end)
             || jsonb_build_object('progress', push_response -> 'progress')
      else p_response end,
    push_error = case when p_state in ('failed', 'waiting', 'held') then left(p_error, 1000) end,
    push_attempts = case when p_state in ('checked', 'waiting', 'held') then 0 else push_attempts end,
    stop_requested = false,
    status = case when p_state = 'sent' then 'done' else status end,
    note = case when p_state = 'sent' then coalesce(left(p_error, 500), note) else note end,
    done_by = case when p_state = 'sent' then 'Lifted App via T3 (' || coalesce(p_by, '?') || ')' else done_by end,
    done_at = case when p_state = 'sent' then now() else done_at end
   where id = p_id;
  if p_state in ('sent', 'failed') then
    insert into events (user_email, type, note, details)
    values (coalesce(p_by, 'metrc worker'), 'metrc_push', p_error,
            jsonb_build_object('id', p_id, 'state', p_state, 'error', left(p_error, 300)));
  end if;
end $$;
revoke all on function metrc_result(bigint, text, text, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function metrc_result(bigint, text, text, jsonb, jsonb, text) to service_role;

-- Napa #1038: back in the auto retry line (only if it's still the failed, not-done harvest-plants to-do)
update comp_metrc_actions set push_attempts = 0
 where id = 1038 and kind = 'harvest_plants' and status in ('todo', 'error') and push_state = 'failed';

select '334 attempts in a row' as ok, (select push_attempts from comp_metrc_actions where id = 1038) as napa_1038_attempts;
