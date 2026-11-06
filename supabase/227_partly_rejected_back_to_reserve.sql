-- 227: Partly rejected lbs go back on the customer's reserve (Aziz 11/6, Msg #273-274).
--  * A package the driver records as rejected at a Partly rejected stop no longer counts as shipped against the reserve,
--    the same way a fully rejected order (cancelled) already gives its lbs back.
--  * Nothing comes off automatically: if those lbs shouldn't stay with the customer, Sales lowers the reserve by hand.
--  * The reserve shows the rejected lbs in a new "rejected" column. Everything that reads reserves (menu, portal,
--    orderable checks, statements) picks it up.
--  * Shows in Sales > Activity ("... rejected at delivery, back on their reserve") and in the customer portal's
--    Reserve History ("Rejected at delivery: back on your reserve"). Safe to re-run.
begin;

create or replace view reserve_balances as
WITH sold AS (
         SELECT o.customer_id,
            l.strain,
            l.crop_year,
            sum(l.lbs) FILTER (WHERE o.status = 'shipped'::text) AS shipped,
            sum(l.lbs) FILTER (WHERE o.status = 'pending'::text) AS pending,
            sum(l.lbs) FILTER (WHERE o.status = 'submitted'::text) AS submitted
           FROM orders o
             JOIN order_lines l ON l.order_id = o.id
          WHERE l.product = 'fresh_frozen'::text
          GROUP BY o.customer_id, l.strain, l.crop_year
        ), back AS (
         SELECT r.customer_id,
            lower(rl.strain) AS k,
            rl.crop_year,
            sum(rl.received_lbs) AS returned,
            bool_or(rl.reason = ANY (ARRAY['quality'::text, 'yield'::text])) AS released
           FROM return_orders r
             JOIN return_lines rl ON rl.return_id = r.id
          WHERE r.status <> 'cancelled'::text AND rl.product = 'fresh_frozen'::text
          GROUP BY r.customer_id, (lower(rl.strain)), rl.crop_year
        ), rej AS (
         -- 227: packages rejected at a Partly rejected stop: back on the reserve (Sales takes them off by hand if needed)
         SELECT o.customer_id,
            lower(l.strain) AS k,
            l.crop_year,
            sum(x.lbs) AS rejected
           FROM orders o
             JOIN load_stops st ON st.id = o.stop_id AND st.outcome = 'partly_rejected'::text
             JOIN order_lines l ON l.order_id = o.id AND l.product = 'fresh_frozen'::text
             JOIN order_picks x ON x.order_line_id = l.id
             JOIN pallets p ON p.id = x.pallet_id
          WHERE o.status = 'shipped'::text AND (EXISTS ( SELECT 1
                   FROM stop_returns r
                  WHERE r.stop_id = st.id AND r.kind = 'rejected'::text AND r.cancelled_at IS NULL AND (r.pallet_id = x.pallet_id OR r.pallet_id = p.container_id)))
          GROUP BY o.customer_id, (lower(l.strain)), l.crop_year
        ), b AS (
         SELECT r.id,
            r.customer_id,
            r.strain,
            r.product,
            r.lbs,
            r.notes,
            r.created_by,
            r.created_at,
            r.updated_by,
            r.updated_at,
            r.crop_year,
            r.grade,
            COALESCE(s.shipped, 0::numeric) - COALESCE(k.returned, 0::numeric) - COALESCE(j.rejected, 0::numeric) AS net_shipped,
            COALESCE(j.rejected, 0::numeric) AS rej,
            COALESCE(s.pending, 0::numeric) AS pend,
            COALESCE(s.submitted, 0::numeric) AS subm,
            COALESCE(k.returned, 0::numeric) AS ret,
            COALESCE(k.released, false) AS rel
           FROM reserves r
             LEFT JOIN sold s ON s.customer_id = r.customer_id AND lower(s.strain) = lower(r.strain) AND s.crop_year = r.crop_year
             LEFT JOIN back k ON k.customer_id = r.customer_id AND k.k = lower(r.strain) AND k.crop_year = r.crop_year
             LEFT JOIN rej j ON j.customer_id = r.customer_id AND j.k = lower(r.strain) AND j.crop_year = r.crop_year
          WHERE r.product = 'fresh_frozen'::text
        )
 SELECT id,
    customer_id,
    strain,
        CASE
            WHEN rel THEN LEAST(lbs, GREATEST(net_shipped, 0::numeric) + pend)
            ELSE lbs
        END AS reserved,
    net_shipped AS shipped,
    pend AS pending,
        CASE
            WHEN rel THEN 0::numeric
            ELSE GREATEST(lbs - net_shipped - pend, 0::numeric)
        END AS remaining,
    crop_year,
    subm AS submitted,
    lbs AS original_lbs,
    ret AS returned,
    rel AS released,
    rej AS rejected
   FROM b;

-- the fresh frozen lbs rejected at one Partly rejected stop, per strain and crop year (what goes back on the reserve)
create or replace function _stop_rejected_lines(p_stop int) returns table (customer_id int, strain text, crop_year int, lbs numeric)
language sql stable security definer set search_path = public as $$
  select o.customer_id, min(l.strain), l.crop_year, sum(x.lbs)
    from load_stops st join orders o on o.stop_id = st.id and o.status = 'shipped'
    join order_lines l on l.order_id = o.id and l.product = 'fresh_frozen'
    join order_picks x on x.order_line_id = l.id join pallets p on p.id = x.pallet_id
   where st.id = p_stop and st.outcome = 'partly_rejected'
     and exists (select 1 from stop_returns r where r.stop_id = st.id and r.kind = 'rejected' and r.cancelled_at is null
                   and (r.pallet_id = x.pallet_id or r.pallet_id = p.container_id))
   group by o.customer_id, lower(l.strain), l.crop_year
$$;
revoke all on function _stop_rejected_lines(int) from public, anon, authenticated;

-- Activity (Sales): one line when a stop is recorded Partly rejected (or changed), saying what went back on the reserve.
-- Runs at the end of the save, after the rejected packages are in.
create or replace function _stop_reserve_back_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare ln jsonb; c customers; l loads;
begin
  if new.outcome is not distinct from old.outcome and new.outcome_at is not distinct from old.outcome_at then return null; end if;
  if new.outcome is distinct from 'partly_rejected' and old.outcome is distinct from 'partly_rejected' then return null; end if;
  select * into c from customers where id = new.customer_id;
  select * into l from loads where id = new.load_id;
  select jsonb_agg(jsonb_build_object('strain', k.strain, 'crop_year', k.crop_year, 'lbs', k.lbs) order by k.strain) into ln from _stop_rejected_lines(new.id) k;
  if new.outcome = 'partly_rejected' and ln is not null then
    insert into events (user_email, type, load_id, lbs, details)
    values (current_email(), 'reserve_back', l.id, (select sum((x ->> 'lbs')::numeric) from jsonb_array_elements(ln) x),
            jsonb_build_object('customer_id', c.id, 'customer', c.name, 'load', l.code, 'seq', new.seq, 'stop_id', new.id, 'manifest', new.manifest,
                               'so', (select string_agg(distinct o.so_number, ', ') from orders o where o.stop_id = new.id), 'lines', ln));
  elsif old.outcome = 'partly_rejected' and new.outcome is distinct from 'partly_rejected' then
    insert into events (user_email, type, load_id, details)
    values (current_email(), 'reserve_back_undone', l.id, jsonb_build_object('customer_id', c.id, 'customer', c.name, 'load', l.code, 'seq', new.seq,
            'stop_id', new.id, 'now', new.outcome));
  end if;
  return null;
end $$;
drop trigger if exists stop_reserve_back on load_stops;
create constraint trigger stop_reserve_back after update on load_stops deferrable initially deferred
  for each row execute function _stop_reserve_back_event();

CREATE OR REPLACE FUNCTION public.my_reserve_activity()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  ),
  -- 227: packages rejected at a Partly rejected delivery: back on the reserve
  rej as (
    select jsonb_build_object(
      'id', 'j' || st.id,
      'at', coalesce(st.outcome_at, st.delivered_at),
      'by', 'lifted',
      'who', 'Lifted',
      'kind', 'rejected',
      'note', 'Rejected at delivery' || coalesce(' on ' || (select string_agg(distinct o.so_number, ', ') from orders o where o.stop_id = st.id), '')
              || coalesce(' (manifest ' || nullif(trim(st.manifest), '') || ')', '') || '. These lbs are back on your reserve.',
      'lines', (select jsonb_agg(jsonb_build_object('s', k.strain, 'y', k.crop_year, 'from', 0, 'to', k.lbs) order by k.strain) from _stop_rejected_lines(st.id) k)
    ) as j
    from load_stops st, me
   where me.cid is not null and st.customer_id = me.cid and st.outcome = 'partly_rejected'
     and exists (select 1 from _stop_rejected_lines(st.id))
  )
  select coalesce(jsonb_agg(x.j order by x.j ->> 'at' desc), '[]'::jsonb)
    from (select j from reqs union all select j from edits union all select j from rej) x
$function$
;

commit;
