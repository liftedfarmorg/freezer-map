-- Migration 350 (FB-0010, Aziz; Msg FBQ-3): Leach % was double.
-- The catch collects from 2 emitters, so Leach % = leachate mL / (front emitter mL x 2) x 100 (was / front mL).
-- Expected % is dropped (Aziz 11/12): no longer calculated or shown; old values stay in the column, unused.
-- Recalculates every row in the app (app entries and the PhenoHunt26 / Webb2026 imports), Aziz 11/12.
-- Dry run 11/12: 429 rows, 258 with a Leach %; average 25.1% -> 12.6%. Safe to re-run.

begin;

create or replace function _leachate_calc() returns trigger
language plpgsql set search_path = public as $$
begin
  new.leach_pct := case when new.leach_vol is not null and coalesce(new.front_ml, 0) > 0
                        then round(new.leach_vol / (new.front_ml * 2) * 100, 1) end;
  return new;
end $$;

insert into events (user_email, type, note, details)
select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email', 'claude'), 'leachate_recalc',
       'Leach % = leachate / (front mL x 2) (FB-0010)',
       jsonb_build_object('rows', count(*), 'avg_before', round(avg(leach_pct), 1))
  from nursery_leachate where leach_pct is not null;

-- the trigger recalculates each row
update nursery_leachate set leach_vol = leach_vol where leach_vol is not null;

commit;

select count(*) as rows, count(leach_pct) as with_pct, round(avg(leach_pct), 1) as avg_pct_now from nursery_leachate;
