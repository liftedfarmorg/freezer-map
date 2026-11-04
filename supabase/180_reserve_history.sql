-- 180: Customer portal — Reserve History.
-- One list per customer, newest first:
--   * their reserve requests, one entry per request batch, with Lifted's decision (status, date, reply) and,
--     per line, the reserve before, what they asked for, what Lifted approved, and the reserve after
--   * reserve changes staff made directly (Sales > Reserves > Edit reserve), from the 'reserve_set' events
--     with via = 'edit'. Edits made in the same minute by the same person with the same reason are one entry.
--     The reason is the note typed in the Edit reserve sheet ("Reason — the customer sees this"); staff edits
--     never stored a note before this, so nothing internal shows up.
-- Staff names and emails aren't shown to the customer; decisions and edits read "Lifted".
-- Safe to re-run.

create or replace function my_reserve_activity() returns jsonb
language sql stable security definer set search_path = public as $$
  with me as (select my_customer() as cid),
  rq as (
    select coalesce(r.batch_id::text, 'r' || r.id) as g, r.*
      from reserve_requests r, me
     where me.cid is not null and r.customer_id = me.cid
  ),
  reqs as (
    select jsonb_build_object(
      'id', 'q' || g,
      'at', min(requested_at),
      'by', 'you',
      'who', coalesce((select u.display_name from app_users u where u.email = min(rq.requested_by)), min(rq.requested_by)),
      'kind', 'request',
      'status', case
        when bool_or(status = 'pending') then 'waiting'
        when bool_and(status = 'cancelled') then 'cancelled'
        when bool_and(status in ('declined', 'cancelled')) then 'declined'
        when bool_and(status = 'cancelled' or (status = 'approved' and coalesce(approved_lbs, requested_lbs) = requested_lbs)) then 'approved'
        else 'partly' end,
      'decidedAt', max(decided_at),
      'decidedBy', case when max(decided_at) is not null then 'Lifted' end,
      'note', max(note),
      'reply', max(decision_note),
      'fromHold', bool_or(hold_line_id is not null),
      'lines', jsonb_agg(jsonb_build_object(
        's', strain, 'y', coalesce(crop_year, crop_year()),
        'from', current_lbs, 'to', requested_lbs, 'ok', approved_lbs,
        'after', case status when 'approved' then coalesce(approved_lbs, requested_lbs)
                             when 'pending' then null
                             else current_lbs end) order by strain)
    ) as j
    from rq group by g
  ),
  ed as (
    select e.*, (e.details ->> 'customer_id')::int as cid
      from events e, me
     where me.cid is not null and e.type = 'reserve_set' and e.details ->> 'via' = 'edit'
       and (e.details ->> 'customer_id')::int = me.cid
       and coalesce((e.details ->> 'was')::numeric, 0) <> coalesce((e.details ->> 'lbs')::numeric, 0)
  ),
  edits as (
    select jsonb_build_object(
      'id', 'e' || min(id),
      'at', min(at),
      'by', 'lifted',
      'who', 'Lifted',
      'kind', 'adjust',
      'note', nullif(trim(coalesce(max(note), '')), ''),
      'lines', jsonb_agg(jsonb_build_object(
        's', details ->> 'strain', 'y', coalesce((details ->> 'crop_year')::int, crop_year()),
        'from', coalesce((details ->> 'was')::numeric, 0), 'to', (details ->> 'lbs')::numeric) order by details ->> 'strain')
    ) as j
    from ed
    group by user_email, date_trunc('minute', at), coalesce(note, '')
  )
  select coalesce(jsonb_agg(x.j order by x.j ->> 'at' desc), '[]'::jsonb)
    from (select j from reqs union all select j from edits) x
$$;

revoke execute on function my_reserve_activity() from public, anon;
grant execute on function my_reserve_activity() to authenticated;

select 'ok' as result;
