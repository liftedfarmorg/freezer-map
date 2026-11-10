-- 328: the customers' reported yields on the strain profile (Settings > Strains > Sales and extraction) (Aziz 11/9, Msg YLD-17).
--  * _reported_runs(): one row per reported run (sent reports only), the parsing that was inside 327's _reported_yields().
--  * _reported_yields(): same columns as 327, now built on _reported_runs() so the menu and the profile can't drift apart.
--  * strain_reported_yields(strain): staff only. SHO and BHO: lowest, highest, average, runs, customers, lbs, ready
--    (2+ customers and 100+ lbs), plus what the menu shows today and where menu yields come from.
-- Only adds / replaces functions (nothing dropped). Safe to re-run.
begin;

create or replace function _reported_runs()
returns table (cid int, sid int, bho boolean, ff numeric, pct numeric)
language sql stable security definer set search_path = public as $$
  with parts as (
    select y.customer_id cid, strain_id_of(l ->> 's') sid,
           coalesce(case when jsonb_typeof(p -> 'bho') = 'boolean' then (p ->> 'bho')::boolean end, false) bho,
           case when jsonb_typeof(p -> 'ff') = 'number' then (p ->> 'ff')::numeric end ff,
           case when jsonb_typeof(p -> 'outV') = 'number' then (p ->> 'outV')::numeric end v,
           p ->> 'outU' u
      from yield_reports y
      cross join lateral jsonb_array_elements(case when jsonb_typeof(y.lines) = 'array' then y.lines else '[]' end) l
      cross join lateral jsonb_array_elements(case when jsonb_typeof(l -> 'parts') = 'array' then l -> 'parts' else '[]' end) p
     where y.sent_at is not null
  ), runs as (
    select cid, sid, bho, ff,
           case when u in ('%', '%ff') then v when u = 'g' then 100 * v / (ff * 453.592) when u = 'kg' then 100 * v * 1000 / (ff * 453.592)
                when u = 'lb' then 100 * v / ff end pct
      from parts where sid is not null and ff > 0 and v is not null and v >= 0
  )
  select cid, sid, bho, ff, pct from runs where pct is not null and pct <= 100
$$;

create or replace function _reported_yields()
returns table (strain_id int, sho_lo numeric, sho_hi numeric, sho_avg numeric, sho_runs int, sho_ready boolean,
               bho_lo numeric, bho_hi numeric, bho_avg numeric, bho_runs int, bho_ready boolean)
language sql stable security definer set search_path = public as $$
  select sid,
         round(min(pct) filter (where not bho), 1), round(max(pct) filter (where not bho), 1),
         round(sum(pct * ff) filter (where not bho) / nullif(sum(ff) filter (where not bho), 0), 1),
         (count(*) filter (where not bho))::int,
         count(distinct cid) filter (where not bho) >= 2 and coalesce(sum(ff) filter (where not bho), 0) >= 100,
         round(min(pct) filter (where bho), 1), round(max(pct) filter (where bho), 1),
         round(sum(pct * ff) filter (where bho) / nullif(sum(ff) filter (where bho), 0), 1),
         (count(*) filter (where bho))::int,
         count(distinct cid) filter (where bho) >= 2 and coalesce(sum(ff) filter (where bho), 0) >= 100
    from _reported_runs() group by sid
$$;
revoke all on function _reported_runs() from public, anon, authenticated;
revoke all on function _reported_yields() from public, anon, authenticated;

create or replace function strain_reported_yields(p_strain int) returns jsonb
language sql stable security definer set search_path = public as $$
  with r as (select * from _reported_runs() where sid = p_strain),
  one as (
    select b, jsonb_build_object(
             'lo', round(min(pct), 1), 'hi', round(max(pct), 1), 'avg', round(sum(pct * ff) / nullif(sum(ff), 0), 1),
             'runs', count(r.pct), 'customers', count(distinct cid), 'lbs', round(coalesce(sum(ff), 0)),
             'ready', count(distinct cid) >= 2 and coalesce(sum(ff), 0) >= 100) j
      from (values (false), (true)) v(b) left join r on r.bho = v.b group by b
  )
  select case when is_staff() then jsonb_build_object(
    'sho', (select j from one where not b), 'bho', (select j from one where b),
    'menu', (select to_jsonb(y) - 'strain_id' from _menu_yields() y where y.strain_id = p_strain),
    'source', coalesce((select value from app_settings where key = 'menu.yield_source'), 'higher')) end
$$;
revoke all on function strain_reported_yields(int) from public, anon;
grant execute on function strain_reported_yields(int) to authenticated;

commit;
