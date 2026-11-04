-- 183: Black Truffle x Pack Mule #6 (T034 + T025) into METRC from 66 Slapz plants (Aziz 11/4, Msgs SPLIT-2 to SPLIT-5).
-- Plan agreed with Aziz: don't change plant strains; harvest 66 Slapz plants (Field 7, CCL25-0000017) into a new harvest named
-- for BT x PM #6, then package T034 (...834, 179.04 lb) and T025 (...825, 65.02 lb) with the BT x PM #6 Fresh Frozen item,
-- 54.3 lb waste, finish. Wet weight 179.04 + 65.02 + 54.3 = 298.36 lb. The to-dos send automatically (all four kinds are on Auto).
-- After T034 is in METRC, split #759 (T034-1, 40 lb for Bear Labs SO-26110301) can be sent again.
-- App: harvest 171 moves to the Slapz planting (Block 7, planting 92) as "planted as Slapz"; T025 added in 42C (it was never in the app).
-- Run live by Claude 11/4.
begin;

-- the app harvest: BT x PM #6, planted as Slapz, 66 plants, Block 7
update cult_harvests set field_id = 8, planting_id = 92, planted_strain = 'Slapz', plants_harvested = 66, updated_at = now()
 where id = 171;
update cult_harvests h set metrc_name = cult_batch_name(h) where id = 171 and metrc_name is null;

-- T025: 65.02 lb on ...825, Freezer 42 slot C (pushed: it goes to METRC through the package to-do below)
insert into pallets (code, strain, zone, harvest_date, og_weight, current_weight, package_tag, tag_pending, status, slot_id, harvest_id, notes, pushed, crop_year)
select 'T025', 'Black Truffle x Pack Mule #6', 'Block 7', date '2026-10-17', 65.02, 65.02, 'ABC06030007AD3D000000825', false, 'in_freezer', 743, 171,
       'Found 11/4 (Aziz): the other BT x PM #6 pallet (old sheet 65.02 on 826). Packaged from the Slapz harvest (183).', true, 2026
 where not exists (select 1 from pallets where code = 'T025');

update cult_harvests set ff_lbs = (select sum(og_weight) from pallets where harvest_id = 171 and parent_id is null and status <> 'archived'),
       waste_lbs = 54.3, updated_at = now() where id = 171;

-- METRC to-dos
insert into comp_metrc_actions (at, license, kind, action, harvest_id, lbs, summary, status, details)
select now(), 'CCL25-0000017', 'harvest_plants', 'Harvest plants', 171, 298.36,
       'Black Truffle x Pack Mule #6 · ' || h.metrc_name || ' · 66 Slapz plants', 'todo',
       jsonb_build_object('type', 'harvest_plants', 'harvest_id', 171, 'batch', h.metrc_name, 'plants', 66, 'wet_lbs', 298.36,
                          'metrc_location', 'Field 7', 'metrc_date', '2026-11-04', 'strain', 'Black Truffle x Pack Mule #6', 'planted_strain', 'Slapz',
                          'site', 'OHR', 'field', 'Block 7', 'by', 'aziz@lifted-organics.com',
                          'note', 'Plan 11/4: T034 + T025 from 66 Slapz plants (no strain change in METRC)')
  from cult_harvests h where h.id = 171;

insert into comp_metrc_actions (at, license, kind, action, harvest_id, pallet_id, code, tag, lbs, summary, status, touch_tags, details)
select now(), 'CCL25-0000017', 'harvest_package', 'Create package from harvest', 171, p.id, p.code, p.package_tag, p.og_weight,
       p.code || ' · ' || p.strain || ' · ' || h.metrc_name, 'todo', array[upper(p.package_tag)],
       jsonb_build_object('harvest_id', 171, 'batch', h.metrc_name, 'by', 'aziz@lifted-organics.com', 'note', 'Plan 11/4 (183)')
  from pallets p join cult_harvests h on h.id = 171
 where p.code in ('T034', 'T025')
 order by p.code desc;

insert into comp_metrc_actions (at, license, kind, action, harvest_id, lbs, summary, status, due_at, details)
select now(), 'CCL25-0000017', x.kind, x.action, 171, x.lbs, 'Black Truffle x Pack Mule #6 · ' || h.metrc_name || x.s, 'todo', now() + x.after,
       jsonb_build_object('harvest_id', 171, 'batch', h.metrc_name, 'site', 'OHR', 'strain', 'Black Truffle x Pack Mule #6', 'by', 'aziz@lifted-organics.com', 'note', 'Plan 11/4 (183)')
  from cult_harvests h,
       (values ('harvest_waste', 'Record harvest waste', 54.3::numeric, ' · 54.3 lb waste', interval '30 minutes'),
               ('harvest_finish', 'Finish harvest', null::numeric, ' · finish', interval '60 minutes')) as x(kind, action, lbs, s, after)
 where h.id = 171;

update cult_harvests set metrc_plants = 66, metrc_wet_lbs = 298.36 where id = 171;

select id, kind, code, lbs, summary from comp_metrc_actions where harvest_id = 171 and status = 'todo' order by id;
commit;
