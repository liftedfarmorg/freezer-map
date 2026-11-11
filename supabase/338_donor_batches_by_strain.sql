-- 338_donor_batches_by_strain.sql (Msg NUR-10, 11/11). Run after 337. Re-runnable.
-- 1. Donor batches one per donor strain: "Rainbow Guava / Hashburger · Batch A (24)" becomes "Rainbow Guava · Batch A (12)" and
--    "Hashburger · Batch A (12)", same dates and trailer. The plants are split evenly (edit a row if the real split is different).
-- 2. The Dragonfruit Soda receiver typed in by hand on the Hashburger run is removed (Aziz 11/11: plant it fresh through the app).
set client_min_messages = warning;

alter table breed_donor_batches drop constraint if exists breed_donor_batches_project_label_key;
create unique index if not exists breed_donor_batches_proj_strain_label on breed_donor_batches (project, coalesce(strains, ''), label);

with src as (select * from breed_donor_batches where strains like '%/%'),
parts as (
  select s.*, trim(x.strain) as one, x.i, count(*) over (partition by s.id) as n
    from src s cross join lateral unnest(string_to_array(s.strains, '/')) with ordinality as x(strain, i)
   where trim(x.strain) <> '')
insert into breed_donor_batches (project, label, strains, plants, cut_on, room_id, to_room_on, move_in_on, notes)
select project, label, one,
       case when plants is null then null else plants / n + case when i = 1 then plants % n else 0 end end,
       cut_on, room_id, to_room_on, move_in_on,
       trim(both ' ' from coalesce(notes, '') || ' [338: split from "' || strains || '" ' || coalesce(plants::text, '?') || ' plants]')
  from parts
on conflict do nothing;
delete from breed_donor_batches d where d.strains like '%/%'
   and not exists (select 1 from nursery_batches b where b.use = 'donors' and b.use_ref = d.id)
   and not exists (select 1 from nursery_plantings p where p.use = 'donors' and p.use_ref = d.id);

delete from breed_receivers r
 where r.strain = 'Dragonfruit Soda' and r.planting_id is null
   and r.run_id = (select id from breed_runs where name = '2026 Seed Project · Hashburger donor');

select (select string_agg(coalesce(strains, '?') || ' ' || label || ' (' || coalesce(plants::text, '?') || ')', ', ' order by strains, label) from breed_donor_batches) as donor_batches,
       (select count(*) from breed_receivers r join breed_runs u on u.id = r.run_id where u.name = '2026 Seed Project · Hashburger donor') as hashburger_run_receivers;
