-- Migration 193: every plant (tag) on small licenses, from the nightly METRC pull (read only). 1PN has a few thousand
-- tagged plants, so the app can tie PhenoHunt26 phenos to their real METRC tags. Licenses with more than 5,000 plants in a
-- phase (the farms) keep counts only. Plus: "HB x Imperial Stout" is Honey Banana x Imperial Stout (Aziz 11/4).
-- Run after 192. Safe to re-run.
set client_min_messages = warning;

create table if not exists metrc_plants (
  license    text not null,
  label      text not null,             -- the plant tag
  id         bigint,
  phase      text not null,             -- vegetative, flowering
  strain     text,
  location   text,
  batch      text,                      -- plant batch it came from (lot tag)
  planted_on date,
  phase_on   date,                      -- date it moved into this phase
  seen_at    timestamptz not null default now(),
  primary key (license, label)
);
create index if not exists metrc_plants_lic_strain on metrc_plants (license, strain, location);
create index if not exists metrc_plants_batch on metrc_plants (batch);
alter table metrc_plants enable row level security;
drop policy if exists read_metrc_plants on metrc_plants;
create policy read_metrc_plants on metrc_plants for select to authenticated using (is_staff());
grant select on metrc_plants to authenticated;
grant all on metrc_plants to service_role;

-- HB = Honey Banana
update seed_lots set mother_strain = 'Honey Banana' where mother_strain = 'HB' and father_strain = 'Imperial Stout' and import_ref = 'import PhenoHunt26';
update phenos set label = regexp_replace(label, '^HB x Imperial Stout', 'Honey Banana x Imperial Stout') where label like 'HB x Imperial Stout #%' and import_ref = 'import PhenoHunt26';

select (select count(*) from seed_lots where mother_strain = 'Honey Banana' and father_strain = 'Imperial Stout') as honey_banana_lot,
       (select count(*) from phenos where label like 'Honey Banana x Imperial Stout #%') as phenos_renamed;
