-- Migration 354 (FB-0011, Jordan's harvest doc; Msg FBQ-3): cutting time per variety from the raw weight timestamps.
-- For each harvest with 3+ raw bins logged live (spread over 5 minutes to 14 hours; bins typed in the next day don't count): first bin to last bin (Pacific time), stretched by one bin interval because cutting
-- starts before the first bin is weighed (n bins span n-1 gaps), minus break / lunch / pause minutes inside that window
-- (from that site's Harvest day card), and the cutters on the card. Read only. Safe to re-run.

create or replace function cult_cutting_times(p_year int, p_harvest bigint default null)
returns table (harvest_id bigint, site text, day date, strain text, bins int, raw_lbs numeric,
               first_at timestamptz, last_at timestamptz, cut_min numeric, break_min numeric, cutters int)
language sql stable security definer set search_path = public as $$
  with w as (
    select h.id, h.site, h.strain, count(*)::int n, sum(x.lbs) lbs, min(x.created_at) a, max(x.created_at) b
      from cult_weights x join cult_harvests h on h.id = x.harvest_id
     where x.kind = 'raw' and h.crop_year = p_year and (p_harvest is null or h.id = p_harvest)
     group by h.id, h.site, h.strain
    -- bins typed in all at once afterwards (or a tiny trial cut) don't say anything about cutting speed
    having count(*) >= 3 and max(x.created_at) - min(x.created_at) between interval '5 minutes' and interval '14 hours'),
  t as (
    select w.*, (w.a at time zone 'America/Los_Angeles') la, (w.b at time zone 'America/Los_Angeles') lb,
           extract(epoch from (w.b - w.a)) / 60.0 * w.n / (w.n - 1) span
      from w),
  d as (
    select t.*, hd.cutters, hd.id day_id, (t.la)::date dday,
           -- the window starts one bin interval before the first bin
           (t.la::time - make_interval(mins => (t.span / t.n)::int)) wa, t.lb::time wb
      from t left join harvest_days hd on hd.site = t.site and hd.day = (t.la)::date)
  select d.id, d.site, d.dday, d.strain, d.n, round(d.lbs, 1), d.a, d.b,
         round(greatest(d.span - coalesce(br.m, 0), 1)::numeric, 0), round(coalesce(br.m, 0)::numeric, 0), d.cutters
    from d left join lateral (
      select sum(greatest(0, extract(epoch from (least(d.wb, coalesce(x.end_at, d.wb)) - greatest(d.wa, x.start_at))) / 60.0)) m
        from harvest_day_breaks x where x.day_id = d.day_id) br on true
   where is_staff()
$$;
revoke all on function cult_cutting_times(int, bigint) from public, anon;
grant execute on function cult_cutting_times(int, bigint) to authenticated;

select 'cult_cutting_times ready' as done, count(*) as harvests_with_times from cult_cutting_times(2026);
