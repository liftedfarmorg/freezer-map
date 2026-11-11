-- 335 (Msg NAPA-8, 11/11): a long METRC send (Napa #1038, 119,300 plants, about a day) no longer holds up the queue.
-- The worker sends one to-do at a time, oldest first, for about 45 s a minute. A harvest that's partway through used the
-- whole 45 s every minute, so newer Auto to-dos (packages, manifests, splits) only went out with a manual Send.
-- Now a harvest / flip that's partway through goes last: everything else due goes first, the harvest gets the time left.
-- Same function as 083 otherwise.

create or replace function metrc_claim_next(p_ids bigint[], p_skip bigint[] default '{}') returns setof comp_metrc_actions
language plpgsql security definer set search_path = public as $$
begin
  update comp_metrc_actions set push_state = 'failed', push_error = coalesce(push_error, 'Stopped mid-send; will retry')
   where push_state = 'sending' and push_at < now() - interval '10 minutes' and kind <> 'flower';
  update comp_metrc_actions set push_state = 'failed', push_error = coalesce(push_error, 'Stopped mid-send; will retry')
   where push_state = 'sending' and push_at < now() - interval '30 minutes' and kind = 'flower';
  return query
  update comp_metrc_actions a set push_state = 'sending', push_attempts = a.push_attempts + 1, push_at = now()
   where a.id in (
     select x.id from comp_metrc_actions x join metrc_push_kinds k on k.kind = x.kind
      where x.status in ('todo', 'error') and k.ready
        and coalesce(x.push_state, '') not in ('sending', 'held')
        and x.id <> all(coalesce(p_skip, '{}'))
        and metrc_past_cutover(x.kind, x.license, x.at)
        and (case when p_ids is not null then x.id = any(p_ids) and k.mode <> 'off'
                  else k.mode = 'auto' and (x.due_at is null or x.due_at <= now())
                       and (x.push_state is null or x.push_state in ('checked', 'waiting')
                            or (x.push_state = 'failed' and x.push_attempts < 3 and x.push_at < now() - interval '15 minutes')) end)
      -- 335: a long harvest / flip that's partway through goes after everything else, so it can't hold up the queue
      order by coalesce(x.kind in ('harvest_plants', 'flower') and x.push_state = 'waiting' and x.push_response ? 'progress', false), x.id
      limit 1
      for update of x skip locked)
  returning a.*;
end $$;

revoke all on function metrc_claim_next(bigint[], bigint[]) from public, anon, authenticated;
grant execute on function metrc_claim_next(bigint[], bigint[]) to service_role;
select '335 long sends go last' as ok;
