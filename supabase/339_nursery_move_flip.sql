-- 339_nursery_move_flip.sql (Msg NUR-12, 11/11). Run after 338. Re-runnable.
-- Nursery Move and Flip, both straight to METRC on Auto:
--   Move: immature batches (plantings: donors, receivers, phenos, trials) or, once flipped, their flowering plants, to another place
--         (METRC plantbatches/change-locations or plants/change-locations).
--   Flip: an immature batch to Flowering, one plant tag each from a consecutive tag run (METRC plantbatches/promote), for
--         donors, receivers and pheno hunt lots (the lot's growing phenos get the tags in pheno number order).
set client_min_messages = warning;

alter table nursery_plantings add column if not exists flipped_on date;
alter table nursery_plantings add column if not exists flower_tags text[] not null default '{}';
alter table nursery_plantings add column if not exists flipped_n int;

-- a consecutive run of tags from a starting tag: 1A4...23760 x 3 = ...23760, ...23761, ...23762
create or replace function nursery_tag_run(p_start text, p_n int) returns text[]
language sql immutable as $$
  select array_agg(substring(upper(trim(p_start)) from '^(.*?)[0-9]+$')
                   || lpad((substring(upper(trim(p_start)) from '([0-9]+)$')::numeric + g)::text, length(substring(upper(trim(p_start)) from '([0-9]+)$')), '0') order by g)
    from generate_series(0, greatest(p_n, 1) - 1) g
$$;

-- Move: p_items = [{planting: id}], all to one place
create or replace function nursery_move(p_items jsonb, p_room int, p_on date default null) returns int
language plpgsql security definer set search_path = public as $$
declare it jsonb; p nursery_plantings; lic text; rm nursery_rooms; n int := 0; what text;
begin
  perform _nursery_admin();
  select * into rm from nursery_rooms where id = p_room;
  if rm.id is null then raise exception 'Pick where they''re going'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    select * into p from nursery_plantings where id = (it ->> 'planting')::bigint for update;
    if p.id is null then raise exception 'Planting not found'; end if;
    if p.room_id = p_room then continue; end if;
    lic := (select license from nursery_sites where code = p.site);
    what := case when p.flipped_on is not null then 'plants' else 'batch' end;
    insert into comp_metrc_actions (license, action, tag, summary, details, kind)
    values (lic, case what when 'plants' then 'Nursery move: flowering plants' else 'Nursery move: immature batch' end, p.plant_tag,
            concat_ws(' · ', p.strain, coalesce(p.flipped_n, p.plants) || ' plants', (select name from nursery_rooms where id = p.room_id) || ' > ' || rm.name, p.use),
            jsonb_build_object('type', 'nursery_move', 'what', what, 'planting_id', p.id, 'lot_tag', p.plant_tag, 'tags', to_jsonb(p.flower_tags),
                               'from_room_id', p.room_id, 'room_id', p_room, 'room', rm.name, 'on', coalesce(p_on, current_date), 'by', current_email()),
            'nursery_move');
    update nursery_plantings set room_id = p_room where id = p.id;
    n := n + 1;
  end loop;
  insert into events (user_email, type, note, details) values (current_email(), 'nursery_moved', rm.name, jsonb_build_object('items', p_items, 'room_id', p_room, 'n', n));
  return n;
end $$;
revoke all on function nursery_move(jsonb, int, date) from public, anon;
grant execute on function nursery_move(jsonb, int, date) to authenticated;

-- Flip: p_items = [{planting: id, start: tag, count: n}] or [{hunt: id, lot: lot_tag, start: tag, count: n}]
create or replace function nursery_flip(p_items jsonb, p_on date default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare it jsonb; p nursery_plantings; n int; tags text[]; lic text; lot text; rm int; strain text; ids bigint[]; out jsonb := '[]'; t text; seen text[] := '{}'; ref jsonb;
begin
  perform _nursery_admin();
  for it in select * from jsonb_array_elements(p_items) loop
    n := (it ->> 'count')::int;
    if coalesce(n, 0) <= 0 then raise exception 'How many plants to flip?'; end if;
    if nullif(trim(it ->> 'start'), '') is null then raise exception 'Scan or type the first plant tag'; end if;
    tags := nursery_tag_run(it ->> 'start', n);
    foreach t in array tags loop
      if t = any(seen) or not _nursery_tag_free(t, 'plant') or exists (select 1 from phenos where upper(plant_tag) = t)
         or exists (select 1 from nursery_plantings where t = any(flower_tags)) then
        raise exception 'Plant tag % is already used (the run starting % needs % tags in a row)', t, upper(it ->> 'start'), n;
      end if;
    end loop;
    seen := seen || tags;
    if it ? 'planting' then
      select * into p from nursery_plantings where id = (it ->> 'planting')::bigint for update;
      if p.id is null then raise exception 'Planting not found'; end if;
      if p.flipped_on is not null then raise exception '% (%) is already flipped', p.strain, p.plant_tag; end if;
      if n > p.plants then raise exception '% has % plants; can''t flip %', p.strain, p.plants, n; end if;
      lot := p.plant_tag; rm := p.room_id; strain := p.strain; lic := (select license from nursery_sites where code = p.site);
      update nursery_plantings set flipped_on = coalesce(p_on, current_date), flower_tags = tags, flipped_n = n where id = p.id;
      ref := jsonb_build_object('planting_id', p.id, 'use', p.use);
    else
      lot := upper(trim(it ->> 'lot'));
      select array_agg(x.id order by x.number), min(x.room_id), min(coalesce(sl.mother_strain || ' x ' || sl.father_strain, x.label))
        into ids, rm, strain
        from (select ph.* from phenos ph
               where ph.hunt_id = (it ->> 'hunt')::bigint and upper(ph.lot_tag) = lot and ph.status in ('growing', 'maybe', 'keeper') and ph.plant_tag is null
               order by ph.number limit n) x
        left join seed_lots sl on sl.id = x.seed_lot_id;
      if coalesce(array_length(ids, 1), 0) = 0 then raise exception 'Lot % has no growing phenos without a tag', lot; end if;
      if array_length(ids, 1) < n then raise exception 'Lot % has only % growing phenos without a tag; flip that many', lot, array_length(ids, 1); end if;
      lic := (select s.license from pheno_hunts h join nursery_sites s on s.code = h.site where h.id = (it ->> 'hunt')::bigint);
      update phenos ph set plant_tag = tags[k.i], tag_confirmed = false, tag_source = 'flip', updated_at = now()
        from unnest(ids) with ordinality as k(id, i) where ph.id = k.id;
      ref := jsonb_build_object('hunt_id', (it ->> 'hunt')::bigint, 'pheno_ids', to_jsonb(ids));
    end if;
    if rm is null then raise exception 'Where is lot % now? Set its place first', lot; end if;
    insert into comp_metrc_actions (license, action, tag, summary, details, kind)
    values (lic, 'Nursery flip: to Flowering', lot,
            concat_ws(' · ', strain, n || ' plants', tags[1] || '..' || right(tags[n], 6), (select name from nursery_rooms where id = rm)),
            jsonb_build_object('type', 'nursery_flip', 'lot_tag', lot, 'count', n, 'from', tags[1], 'to', tags[n], 'tags', to_jsonb(tags),
                               'room_id', rm, 'room', (select name from nursery_rooms where id = rm), 'strain', strain, 'on', coalesce(p_on, current_date), 'by', current_email()) || ref,
            'nursery_flip');
    out := out || jsonb_build_object('lot', lot, 'n', n, 'from', tags[1], 'to', tags[n]);
  end loop;
  insert into events (user_email, type, note, details) values (current_email(), 'nursery_flipped', null, jsonb_build_object('items', out));
  return out;
end $$;
revoke all on function nursery_flip(jsonb, date) from public, anon;
grant execute on function nursery_flip(jsonb, date) to authenticated;

insert into metrc_push_kinds (kind, label, phase, sort, ready, mode) values
  ('nursery_move', 'Nursery: move immature batches / flowering plants', 2, 95, true, 'auto'),
  ('nursery_flip', 'Nursery: flip to Flowering (donors, receivers, pheno lots)', 2, 96, true, 'auto')
on conflict (kind) do update set label = excluded.label, ready = true;

select (select string_agg(kind || '=' || mode, ', ' order by kind) from metrc_push_kinds where kind like 'nursery%') as nursery_modes,
       nursery_tag_run('1A406020006AF55000023760', 3) as tag_run_test;
