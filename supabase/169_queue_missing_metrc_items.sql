-- RUN LIVE 11/3 by Claude in the SQL Editor (Aziz OK). 2 strains + 22 items queued; worker sending them.
-- 169: queue METRC to-dos for app items METRC doesn't have (Aziz 11/3, item cleanup plan groups B, C, D, E).
-- Strain + item create to-dos are mode AUTO: once this runs, the worker sends them to METRC within about a minute.
--  * C (12): Dry Harvest items at OHR (10) + Cadillac Rainbows Dry Harvest and Unbucked at GVR farm.
--  * E (1): FL26OH Greenfield Kush Fresh Frozen, plus the strain Greenfield Kush on OHR (METRC doesn't have it).
--  * B (8): "Unbucked Dry Flower" items on GVR processing (CCL21-0000679) for the 8 unbucked packages there. No repackage (Aziz).
--  * D (1): FL26OH Violet Torque Fresh Frozen, plus the strain Violet Torque on OHR (METRC has these packages as Newport Punch #6;
--    Aziz: same strain, use Violet Torque). No repackage.
-- Category / unit copied from METRC items of the same kind (Dry Harvest + Fresh Frozen = Fresh Cannabis Plant, Unbucked = Flower; lb).
-- Skips anything already queued or already in METRC. Safe to re-run.
begin;

create temp table _want(item_id bigint, license text, category text) on commit drop;
insert into _want values
  (279,'CCL25-0000017','Fresh Cannabis Plant'),(277,'CCL25-0000017','Fresh Cannabis Plant'),(273,'CCL25-0000017','Fresh Cannabis Plant'),
  (276,'CCL25-0000017','Fresh Cannabis Plant'),(280,'CCL25-0000017','Fresh Cannabis Plant'),(271,'CCL25-0000017','Fresh Cannabis Plant'),
  (278,'CCL25-0000017','Fresh Cannabis Plant'),(272,'CCL25-0000017','Fresh Cannabis Plant'),(274,'CCL25-0000017','Fresh Cannabis Plant'),
  (275,'CCL25-0000017','Fresh Cannabis Plant'),
  (265,'CCL25-0000175','Fresh Cannabis Plant'),(266,'CCL25-0000175','Flower'),
  (81, 'CCL25-0000017','Fresh Cannabis Plant'),
  (42, 'CCL25-0000017','Fresh Cannabis Plant'),
  (312,'CCL21-0000679','Flower'),(343,'CCL21-0000679','Flower'),(313,'CCL21-0000679','Flower'),(345,'CCL21-0000679','Flower'),
  (304,'CCL21-0000679','Flower'),(19, 'CCL21-0000679','Flower'),(346,'CCL21-0000679','Flower'),(344,'CCL21-0000679','Flower');

do $$
declare r record; sid bigint; aid bigint; s strains;
begin
  for r in
    select * from (
      select distinct 'strain'::text what, w.license, i.strain_id, metrc_strain_on(i.strain_id, w.license) as name, null::text finish, null::int crop_year,
             null::text site, null::bigint item_id, null::text category, null::text uom
        from _want w join items i on i.id = w.item_id
       where not exists (select 1 from metrc_strains x where x.license = w.license and lower(x.name) = lower(metrc_strain_on(i.strain_id, w.license)) and not x.archived)
      union all
      select 'item', w.license, i.strain_id, i.metrc_name, i.finish, i.crop_year, i.site,
             case when w.license = i.license then i.id end,   -- the GVR processing copies aren't the app's farm item
             w.category, 'Pounds'
        from _want w join items i on i.id = w.item_id
       where not exists (select 1 from metrc_items x where x.license = w.license and lower(x.name) = lower(i.metrc_name) and not x.archived)
    ) q
    where not exists (select 1 from metrc_setup su where su.license = q.license and su.what = q.what and lower(su.metrc_name) = lower(q.name)
                        and su.status in ('queued', 'in_metrc'))
    order by q.what = 'item', q.license, q.name
  loop
    select * into s from strains where id = r.strain_id;
    insert into metrc_setup (strain_id, license, what, metrc_name, finish, crop_year, site, item_id, category, uom, status)
    values (r.strain_id, r.license, r.what, r.name, r.finish, r.crop_year, r.site, r.item_id, r.category, r.uom, 'queued')
    on conflict (license, what, lower(metrc_name)) do update set status = 'queued', item_id = excluded.item_id,
           category = excluded.category, uom = excluded.uom, updated_at = now()
    returning id into sid;
    insert into comp_metrc_actions (license, action, summary, details, kind)
    values (r.license,
            case r.what when 'strain' then 'Create strain in METRC' else 'Create item in METRC' end,
            case r.what when 'strain' then 'Strain ' || r.name else r.name end,
            jsonb_build_object('type', case r.what when 'strain' then 'strain_create' else 'item_create' end,
                               'strain_id', s.id, 'strain', s.name, 'setup_id', sid, 'name', r.name,
                               'strain_name', metrc_strain_on(s.id, r.license), 'finish', r.finish, 'crop_year', r.crop_year, 'farm', r.site,
                               'category', r.category, 'uom', r.uom, 'license_kind', (select kind from licenses where license_no = r.license),
                               'testing', s.metrc_testing, 'thc', s.metrc_thc, 'cbd', s.metrc_cbd, 'indica', s.metrc_indica, 'sativa', s.metrc_sativa,
                               'source', '169 item cleanup'),
            case r.what when 'strain' then 'strain_create' else 'item_create' end)
    returning id into aid;
    update metrc_setup set action_id = aid where id = sid;
  end loop;
end $$;

insert into events (user_email, type, note, details)
values (coalesce(current_email(), 'SQL 169'), 'metrc_items_queued', '169 item cleanup (groups B, C, D, E)', '{}'::jsonb);

-- what got queued
select a.id, a.license, a.kind, a.summary, a.status from comp_metrc_actions a
 where a.details ->> 'source' = '169 item cleanup' order by a.id;

commit;
