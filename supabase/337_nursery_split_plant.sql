-- 337_nursery_split_plant.sql (Msg NUR-9, 11/11). Run after 336. Re-runnable.
-- Nursery packages: split (new METRC package from a clone package, with a use) and plant (immature plant batch from a package),
-- one immature batch per variety per use/location (up to 100 plants, one plant tag each). Both go to METRC on Auto.
--   1. 1PN rooms matched to METRC locations: Trailer N = Clone Chamber N, Greenhouse + GH benches = Greenhouse, Hoop N = Mom House N
--   2. Diesel Daiquiri (batch 165) = METRC package Fatso x Nam Wah #37 (Aziz 11/11)
--   3. nursery_batches: parent_id, use, use_ref, split_out; nursery_plantings; breed_receivers.batch_id / planting_id
--   4. nursery_batch_left(), nursery_split(), nursery_plant(); nursery_plant_moms counts splits and plantings
--   5. METRC kinds nursery_split, nursery_plant (Auto); a split's child never queues a "clone package from mother lot"
--   6. Compliance > Reconcile > Nursery uses the package tag and counts splits and plantings
set client_min_messages = warning;

-- ---------- 1. locations ----------
insert into metrc_location_map (app_kind, app_ref, license, location_id, location, updated_by)
select 'room', r.id::text, s.license, l.id, l.name, 'sql 337'
  from nursery_rooms r
  join nursery_sites s on s.code = r.site and s.license is not null
  join metrc_locations l on l.license = s.license and not l.archived and lower(l.name) = lower(
         case when r.name ~* '^Trailer [0-9]+$' then 'Clone Chamber ' || substring(r.name from '[0-9]+')
              when r.name ~* '^Hoop [0-9]+$' then 'Mom House ' || substring(r.name from '[0-9]+')
              when r.name = 'Greenhouse' or r.name ~* '^GH B[0-9]+$' then 'Greenhouse' end)
 where r.site = '1PN' and coalesce(r.place, 'Webb') = 'Webb'
on conflict (app_kind, app_ref, license) do nothing;

-- ---------- 2. Diesel Daiquiri = Fatso x Nam Wah #37 ----------
update nursery_batches b
   set package_tag = upper(p.label), cuttings = round(p.qty)::int + coalesce(b.lost, 0), tags = '{}',
       notes = trim(both ' ' from regexp_replace(coalesce(b.notes, ''), '\s*\(cut count not entered yet: 36 standard cuts assumed\)', ''))
               || ' [337: METRC package is "Fatso x Nam Wah #37" (Aziz 11/11)]',
       updated_at = now()
  from metrc_packages p
 where b.id = 165 and b.strain = 'Diesel Daiquiri' and b.package_tag is null
   and p.license = 'CCL24-0000156' and p.state = 'active' and p.item = '1PN - Fatso x Nam Wah #37 - Clone';

-- ---------- 3. columns and tables ----------
alter table nursery_batches add column if not exists parent_id bigint references nursery_batches(id) on delete set null;
alter table nursery_batches add column if not exists use text;
alter table nursery_batches drop constraint if exists nursery_batches_use_chk;
alter table nursery_batches add constraint nursery_batches_use_chk
  check (use is null or use in ('g1', 'g2', 'g3', 'g4', 'phenos', 'keepers', 'trials', 'receivers', 'donors'));
alter table nursery_batches add column if not exists use_ref bigint;          -- receivers: breed_runs.id, donors: breed_donor_batches.id
alter table nursery_batches add column if not exists split_out int not null default 0;
create index if not exists nursery_batches_parent_idx on nursery_batches (parent_id);

create table if not exists nursery_plantings (
  id          bigserial primary key,
  site        text not null references nursery_sites(code) on update cascade,
  batch_id    bigint not null references nursery_batches(id) on delete restrict,   -- the clone package it was planted from
  use         text not null,
  use_ref     bigint,
  receiver_id bigint references breed_receivers(id) on delete set null,
  room_id     int references nursery_rooms(id) on delete set null,
  bed         text,
  strain      text not null,
  plants      int not null check (plants between 1 and 100),
  plant_tag   text not null unique,
  planted_on  date not null default current_date,
  action_id   bigint,
  created_by  text default current_email(),
  created_at  timestamptz not null default now()
);
create index if not exists nursery_plantings_batch_idx on nursery_plantings (batch_id);
alter table nursery_plantings enable row level security;
drop policy if exists nursery_plantings_read on nursery_plantings;
create policy nursery_plantings_read on nursery_plantings for select to authenticated using (has_module('nursery') or comp_can_read());

alter table breed_receivers add column if not exists batch_id bigint references nursery_batches(id) on delete set null;
alter table breed_receivers add column if not exists planting_id bigint references nursery_plantings(id) on delete set null;

-- ---------- 4. functions ----------
create or replace function nursery_batch_left(p_id bigint) returns int
language sql stable security definer set search_path = public as $$
  select greatest(0, b.cuttings - coalesce(b.lost, 0) - coalesce(b.split_out, 0)
         - coalesce((select sum(plants) from nursery_deliveries where batch_id = b.id), 0)
         - coalesce((select sum(qty + lost) from nursery_mothers where batch_id = b.id), 0)
         - coalesce((select sum(plants) from nursery_plantings where batch_id = b.id), 0))::int
    from nursery_batches b where b.id = p_id
$$;
grant execute on function nursery_batch_left(bigint) to authenticated;

create or replace function _nursery_admin() returns void
language plpgsql stable security definer set search_path = public as $$
begin
  perform no_view_as();
  if not (is_admin() or is_mod_admin('nursery')) then raise exception 'Only a Nursery Admin can split or plant packages'; end if;
end $$;

-- a plant or package tag nothing in the app (or METRC, last pull) already uses
create or replace function _nursery_tag_free(p_tag text, p_type text) returns boolean
language sql stable security definer set search_path = public as $$
  select case when p_type = 'package' then
      not exists (select 1 from nursery_batches where upper(package_tag) = upper(p_tag))
      and not exists (select 1 from metrc_packages where upper(label) = upper(p_tag) and state in ('active', 'intransit'))
    else
      not exists (select 1 from nursery_mothers where upper(plant_tag) = upper(p_tag))
      and not exists (select 1 from nursery_plantings where upper(plant_tag) = upper(p_tag))
      and not exists (select 1 from metrc_plant_batches where upper(name) = upper(p_tag) and state = 'active')
      and not exists (select 1 from metrc_plants where upper(label) = upper(p_tag))
    end
$$;

-- Split: a new clone package (its own tag, same item) from a package, with a use. Goes to METRC right away (Auto).
create or replace function nursery_split(p_batch bigint, p_qty int, p_use text, p_ref bigint, p_tag text, p_on date default null) returns bigint
language plpgsql security definer set search_path = public as $$
declare b nursery_batches; nid bigint; tg text := upper(trim(coalesce(p_tag, ''))); lic text; aid bigint;
begin
  perform _nursery_admin();
  select * into b from nursery_batches where id = p_batch for update;
  if b.id is null then raise exception 'Package not found'; end if;
  if b.package_tag is null then raise exception 'This batch has no METRC package tag yet'; end if;
  if coalesce(p_qty, 0) <= 0 then raise exception 'How many plants?'; end if;
  if p_qty > nursery_batch_left(b.id) then raise exception 'The package only has % plants left', nursery_batch_left(b.id); end if;
  if p_use is null then raise exception 'Pick what the new package is for'; end if;
  if tg = '' then raise exception 'Scan or type the new package tag'; end if;
  if tg !~ '^1A4' then raise exception '% doesn''t look like a METRC tag', tg; end if;
  if not _nursery_tag_free(tg, 'package') then raise exception 'Package tag % is already used', tg; end if;
  if p_use = 'receivers' and not exists (select 1 from breed_runs where id = p_ref) then raise exception 'Pick the pollination run'; end if;
  if p_use = 'donors' and p_ref is not null and not exists (select 1 from breed_donor_batches where id = p_ref) then raise exception 'Donor batch not found'; end if;
  lic := (select license from nursery_sites where code = b.site);

  insert into nursery_batches (site, room_id, strain, name, cut_on, cuttings, lost, ready_on, stage, tags, package_tag, notes, gen, season, mother_id,
                               trays, emerged_on, moved_out_on, parent_id, use, use_ref)
  values (b.site, b.room_id, b.strain, b.name, b.cut_on, p_qty, 0, b.ready_on, b.stage, '{}', tg, null, b.gen, b.season, b.mother_id,
          null, b.emerged_on, null, b.id, p_use, case when p_use in ('receivers', 'donors') then p_ref end)
  returning id into nid;
  update nursery_batches set split_out = coalesce(split_out, 0) + p_qty, updated_at = now() where id = b.id;
  -- all of it split off: the parent package is used up
  update nursery_batches set stage = 'done' where id = b.id and nursery_batch_left(b.id) = 0 and stage in ('rooting', 'ready');

  insert into comp_metrc_actions (license, action, tag, summary, details, kind)
  values (lic, 'Nursery split: new clone package', tg,
          concat_ws(' · ', b.strain, p_qty || ' plants', 'from ' || b.package_tag, p_use),
          jsonb_build_object('type', 'nursery_split', 'batch_id', nid, 'parent_id', b.id, 'from', b.package_tag, 'to', tg, 'qty', p_qty,
                             'use', p_use, 'use_ref', p_ref, 'strain', b.strain, 'site', b.site, 'on', coalesce(p_on, current_date), 'by', current_email()),
          'nursery_split')
  returning id into aid;
  insert into events (user_email, type, note, details)
  values (current_email(), 'nursery_split', b.strain, jsonb_build_object('batch_id', nid, 'parent_id', b.id, 'from', b.package_tag, 'to', tg, 'qty', p_qty, 'use', p_use, 'action_id', aid));
  return nid;
end $$;
revoke all on function nursery_split(bigint, int, text, bigint, text, date) from public, anon;
grant execute on function nursery_split(bigint, int, text, bigint, text, date) to authenticated;

-- Plant: immature plant batches from packages. p_lines = [{batch, use, ref, receiver_id, room, bed, plants, tag}], up to 100 plants a line.
-- G1-G3 moms become mother lots (their own METRC to-do, "mother lot from clone package"); everything else a nursery planting.
create or replace function nursery_plant(p_lines jsonb, p_on date default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare l jsonb; b nursery_batches; u text; n int; tg text; rm int; lic text; pid bigint; aid bigint; run breed_runs; out jsonb := '[]'; seen text[] := '{}';
begin
  perform _nursery_admin();
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then raise exception 'Nothing to plant'; end if;
  for l in select * from jsonb_array_elements(p_lines) loop
    select * into b from nursery_batches where id = (l ->> 'batch')::bigint for update;
    if b.id is null then raise exception 'Package not found'; end if;
    u := coalesce(nullif(l ->> 'use', ''), b.use, 'g' || b.gen);
    n := (l ->> 'plants')::int;
    tg := upper(trim(coalesce(l ->> 'tag', '')));
    if b.package_tag is null then raise exception '%: no METRC package tag yet', b.strain; end if;
    if b.stage <> 'ready' then raise exception '%: mark the package ready first', b.strain; end if;
    if u = 'g4' then raise exception '%: G4 plants aren''t planted at the nursery. Pick what they''re for (G1 moms, receivers ...).', b.strain; end if;
    if coalesce(n, 0) <= 0 or n > 100 then raise exception '%: 1 to 100 plants per plant tag', b.strain; end if;
    if n > nursery_batch_left(b.id) then raise exception '%: the package only has % plants left', b.strain, nursery_batch_left(b.id); end if;
    if tg = '' then raise exception '%: scan or type the plant tag', b.strain; end if;
    if tg = any(seen) or not _nursery_tag_free(tg, 'plant') then raise exception 'Plant tag % is already used', tg; end if;
    seen := seen || tg;
    rm := nullif(l ->> 'room', '')::int;
    if u = 'receivers' then
      select * into run from breed_runs where id = (l ->> 'ref')::bigint;
      if run.id is null then raise exception '%: pick the pollination run', b.strain; end if;
      rm := coalesce(run.room_id, rm);
      if rm is null then raise exception 'Set the trailer on run "%" first', run.name; end if;
    elsif u = 'donors' then
      rm := coalesce(rm, (select room_id from breed_donor_batches where id = (l ->> 'ref')::bigint));
    end if;
    if rm is null then raise exception '%: pick where they''re planted', b.strain; end if;
    lic := (select license from nursery_sites where code = b.site);

    if u in ('g1', 'g2', 'g3') then
      insert into nursery_mothers (site, room_id, strain, plant_tag, started_on, qty, gen, season, bed, batch_id)
      values (b.site, rm, b.strain, tg, coalesce(p_on, current_date), n, substring(u from 2)::int,
              coalesce(b.season, extract(year from current_date)::int), nullif(upper(trim(l ->> 'bed')), ''), b.id)
      returning id into pid;
      out := out || jsonb_build_object('mother_id', pid, 'tag', tg, 'strain', b.strain, 'plants', n);
    else
      insert into nursery_plantings (site, batch_id, use, use_ref, receiver_id, room_id, bed, strain, plants, plant_tag, planted_on)
      values (b.site, b.id, u, nullif(l ->> 'ref', '')::bigint, nullif(l ->> 'receiver_id', '')::bigint, rm, nullif(upper(trim(l ->> 'bed')), ''),
              b.strain, n, tg, coalesce(p_on, current_date))
      returning id into pid;
      insert into comp_metrc_actions (license, action, tag, summary, details, kind)
      values (lic, 'Nursery planting: immature plant batch', b.package_tag,
              concat_ws(' · ', b.strain, n || ' plants', tg, (select name from nursery_rooms where id = rm), u),
              jsonb_build_object('type', 'nursery_plant', 'planting_id', pid, 'batch_id', b.id, 'source_tag', b.package_tag, 'lot_tag', tg, 'plants', n,
                                 'room_id', rm, 'room', (select name from nursery_rooms where id = rm), 'strain', b.strain, 'use', u,
                                 'on', coalesce(p_on, current_date), 'by', current_email()),
              'nursery_plant')
      returning id into aid;
      update nursery_plantings set action_id = aid where id = pid;
      if u = 'receivers' then
        if nullif(l ->> 'receiver_id', '') is not null then
          update breed_receivers set plant_tag = tg, plants = n, batch_id = b.id, planting_id = pid where id = (l ->> 'receiver_id')::bigint;
        else
          insert into breed_receivers (run_id, strain, mother_id, plants, plant_tag, batch_id, planting_id) values (run.id, b.strain, b.mother_id, n, tg, b.id, pid);
        end if;
      end if;
      out := out || jsonb_build_object('planting_id', pid, 'action_id', aid, 'tag', tg, 'strain', b.strain, 'plants', n);
    end if;
    update nursery_batches set moved_out_on = coalesce(moved_out_on, coalesce(p_on, current_date)) where id = b.id;
    update nursery_batches set stage = 'done' where id = b.id and nursery_batch_left(b.id) = 0;
  end loop;
  insert into events (user_email, type, note, details) values (current_email(), 'nursery_planted', null, jsonb_build_object('lines', out));
  return out;
end $$;
revoke all on function nursery_plant(jsonb, date) from public, anon;
grant execute on function nursery_plant(jsonb, date) to authenticated;

-- the old "Plant as G2 moms" counts splits and plantings too
create or replace function nursery_plant_moms(p_batch bigint, p_room int, p_bed text, p_qty int, p_tag text, p_on date default null) returns nursery_mothers
language plpgsql security definer set search_path = public as $$
declare b nursery_batches; m nursery_mothers;
begin
  perform no_view_as();
  if not has_module('nursery') then raise exception 'The Nursery module isn''t switched on for your account'; end if;
  select * into b from nursery_batches where id = p_batch for update;
  if b.id is null then raise exception 'Batch not found'; end if;
  if b.gen = 4 then raise exception 'G4 clones go to the farms, not into the hoops'; end if;
  if coalesce(p_qty, 0) <= 0 then raise exception 'How many plants?'; end if;
  if p_qty > nursery_batch_left(b.id) then raise exception 'That batch doesn''t have % plants left', p_qty; end if;
  insert into nursery_mothers (site, room_id, strain, plant_tag, started_on, qty, gen, season, bed, batch_id, pot)
  values (b.site, p_room, b.strain, nullif(upper(trim(p_tag)), ''), coalesce(p_on, current_date), p_qty, b.gen, coalesce(b.season, extract(year from current_date)::int),
          nullif(upper(trim(p_bed)), ''), b.id, null)
  returning * into m;
  update nursery_batches set stage = 'done' where id = b.id and nursery_batch_left(b.id) = 0;
  update nursery_batches set moved_out_on = coalesce(moved_out_on, coalesce(p_on, current_date)) where id = b.id;
  return m;
end $$;

-- ---------- 5. METRC ----------
insert into metrc_push_kinds (kind, label, phase, sort, ready, mode) values
  ('nursery_split', 'Nursery: split a clone package (new package)', 2, 91, true, 'auto'),
  ('nursery_plant', 'Nursery: immature plant batch from a package (receivers, donors, phenos, trials)', 2, 93, true, 'auto')
on conflict (kind) do update set label = excluded.label, ready = true;

-- a split's child is a new package from a package, not a cutting event
create or replace function _metrc_nursery_batch() returns trigger
language plpgsql security definer set search_path = public as $$
declare m nursery_mothers;
begin
  if new.mother_id is not null then select * into m from nursery_mothers where id = new.mother_id; end if;
  if new.parent_id is null and coalesce(new.cuttings, 0) > 0 and (tg_op = 'INSERT' or coalesce(old.cuttings, 0) = 0) then
    insert into events (user_email, type, note, details)
    values (current_email(), 'nursery_cut', new.strain,
            jsonb_strip_nulls(jsonb_build_object('batch_id', new.id, 'site', new.site, 'strain', new.strain, 'cuttings', new.cuttings, 'cut_on', new.cut_on,
                               'mother_id', new.mother_id, 'mother_tag', m.plant_tag, 'tag', new.package_tag, 'gen', new.gen, 'name', new.name)));
  elsif tg_op = 'UPDATE' and coalesce(new.lost, 0) > coalesce(old.lost, 0) and coalesce(old.cuttings, 0) > 0 then
    insert into events (user_email, type, note, details)
    values (current_email(), 'nursery_loss', new.strain,
            jsonb_strip_nulls(jsonb_build_object('what', 'clones', 'batch_id', new.id, 'site', new.site, 'strain', new.strain,
                               'lost', new.lost - coalesce(old.lost, 0), 'tag', new.package_tag, 'name', new.name)));
  end if;
  return new;
exception when others then return new;
end $$;

-- ---------- 6. reconcile: package tag, splits and plantings ----------
create or replace function comp_reconcile_nursery() returns table (
  kind text, issue text, tag text, strain text, name text, app_n int, metrc_n numeric, metrc_item text, metrc_location text,
  metrc_state text, ref_id bigint, note text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not comp_can_read() then raise exception 'Only Compliance can see this'; end if;
  return query
  with lic as (select license from nursery_sites where license is not null),
  b as (
    select x.id, upper(coalesce(x.package_tag, x.tags[1])) as tg, x.strain, coalesce(x.name, 'Batch ' || x.id) as nm, x.stage,
           nursery_batch_left(x.id) as left_n
      from nursery_batches x where coalesce(x.cuttings, 0) > 0),
  p as (
    select upper(k.label) as tg, k.qty, k.item, k.location, k.state from metrc_packages k
     where k.license in (select license from lic) and (k.uom ~* '^(ea|each)' or (k.lbs is null and k.qty is not null))),
  pa as (select * from p where state in ('active', 'intransit')),
  m as (select x.id, upper(x.plant_tag) as tg, x.strain, x.status, greatest(0, x.qty - x.lost)::int as live_n,
               (select r.name from nursery_rooms r where r.id = x.room_id) as room
          from nursery_mothers x
        union all
        select -y.id, upper(y.plant_tag), y.strain, 'active', y.plants, (select r.name from nursery_rooms r where r.id = y.room_id)
          from nursery_plantings y),
  mb as (select upper(coalesce(y.name, '')) as tg, y.untracked, y.strain, y.location, y.type from metrc_plant_batches y
          where y.license in (select license from lic) and y.state = 'active')
  select 'clones', 'count', b.tg, b.strain, b.nm, b.left_n, pa.qty, pa.item, pa.location, pa.state, b.id,
         case when b.left_n = 0 then 'Nothing left in the app (split, planted, delivered or lost); still in METRC' end
    from b join pa on pa.tg = b.tg where round(pa.qty) <> b.left_n
  union all
  select 'clones', 'not_in_metrc', b.tg, b.strain, b.nm, b.left_n, null, null, null,
         (select p.state from p where p.tg = b.tg limit 1), b.id,
         case when exists (select 1 from p where p.tg = b.tg) then 'METRC has it ' || (select p.state from p where p.tg = b.tg limit 1)
              else 'Never made in METRC (or not pulled yet)' end
    from b where b.tg is not null and b.left_n > 0 and not exists (select 1 from pa where pa.tg = b.tg)
  union all
  select 'clones', 'no_tag', null, b.strain, b.nm, b.left_n, null, null, null, null, b.id, 'The batch has no clone package tag in the app'
    from b where b.tg is null and b.left_n > 0 and b.stage not in ('done', 'cancelled')
  union all
  select 'clones', 'not_in_app', pa.tg, null, null, null, pa.qty, pa.item, pa.location, pa.state, null,
         case when pa.item ~* 'seed' then 'Seed package: not tracked in the app yet' else 'No cutting batch has this tag' end
    from pa where not exists (select 1 from b where b.tg = pa.tg)
  union all
  select 'mothers', 'count', m.tg, m.strain, m.room, m.live_n, mb.untracked, mb.type, mb.location, 'active', m.id, null
    from m join mb on mb.tg = m.tg where m.status = 'active' and coalesce(mb.untracked, 0) <> m.live_n
  union all
  select 'mothers', 'not_in_metrc', m.tg, m.strain, m.room, m.live_n, null, null, null, null, m.id, 'No active METRC plant batch with this tag'
    from m where m.status = 'active' and m.tg is not null and m.live_n > 0 and not exists (select 1 from mb where mb.tg = m.tg)
  union all
  select 'mothers', 'no_tag', null, m.strain, m.room, m.live_n, null, null, null, null, m.id, 'The mother lot has no plant tag in the app'
    from m where m.status = 'active' and m.tg is null and m.live_n > 0
  union all
  select 'mothers', 'closed_in_app', m.tg, m.strain, m.room, 0, mb.untracked, mb.type, mb.location, 'active', m.id, 'Lot is ' || m.status || ' in the app, still active in METRC'
    from m join mb on mb.tg = m.tg where m.status <> 'active' and coalesce(mb.untracked, 0) > 0
      and not exists (select 1 from m m2 where m2.tg = m.tg and m2.status = 'active')
  union all
  select 'mothers', 'not_in_app', mb.tg, mb.strain, null, null, mb.untracked, mb.type, mb.location, 'active', null, 'No mother lot or planting in the app has this tag'
    from mb where coalesce(mb.untracked, 0) > 0 and not exists (select 1 from m where m.tg = mb.tg);
end $$;

-- check
select (select count(*) from metrc_location_map where license = 'CCL24-0000156') as rooms_matched,
       (select package_tag from nursery_batches where id = 165) as diesel_daiquiri_package,
       (select cuttings from nursery_batches where id = 165) as diesel_daiquiri_count,
       (select string_agg(kind || '=' || mode, ', ' order by kind) from metrc_push_kinds where kind like 'nursery%') as nursery_modes;
