-- Migration 194: PhenoHunt26 phenos get their METRC plant tags (unconfirmed until someone checks the plant), everyone keeps
-- their own scorecard (scores already were per person; grower notes now are too), and seed lots show their METRC seed package.
-- Aziz 11/4: tie tags in number order (#1 = lowest tag of its cross and hoop), mark them unconfirmed; Tiffani and anyone with
-- Nursery access scores, each with their own card. Run after 193. Safe to re-run.
set client_min_messages = warning;

alter table phenos add column if not exists tag_confirmed boolean not null default false;
alter table phenos add column if not exists tag_source text;            -- 'metrc order' (tied by the app) or null (typed / scanned)

-- grower notes: one card per person per stage
update pheno_obs set observer = coalesce(observer, current_email(), 'unknown') where observer is null;
alter table pheno_obs alter column observer set not null;
alter table pheno_obs drop constraint if exists pheno_obs_pheno_id_stage_key;
create unique index if not exists pheno_obs_person_uq on pheno_obs (pheno_id, stage, observer);
drop policy if exists n_add on pheno_obs; drop policy if exists n_edit on pheno_obs; drop policy if exists n_delete on pheno_obs;
create policy n_add on pheno_obs for insert to authenticated with check (has_module('nursery') and observer = current_email() and not impersonating());
create policy n_edit on pheno_obs for update to authenticated using (observer = current_email()) with check (observer = current_email() and not impersonating());
create policy n_delete on pheno_obs for delete to authenticated using ((observer = current_email() or is_mod_admin('nursery')) and not impersonating());

-- seed lots <-> METRC seed packages (1PN)
alter table seed_lots add column if not exists package_tags text[] not null default '{}';
create or replace function seed_cross_key(s text) returns text language sql immutable as $$
  select regexp_replace(lower(replace(coalesce(s, ''), 'Violet Torque', 'Newport Punch #6')), '[^a-z0-9#]', '', 'g') $$;
update seed_lots s set package_tags = x.tags
  from (select s2.id, array_agg(p.label order by p.label) tags
          from seed_lots s2
          join metrc_packages p on p.license = 'CCL24-0000156' and p.state = 'active' and (p.item ilike '%seed%' or p.category ilike '%seed%')
           and seed_cross_key(regexp_replace(regexp_replace(p.item, '^.*?\) - |^1PN - ', ''), ' - Seed.*$', '')) = seed_cross_key(concat_ws(' x ', s2.mother_strain, s2.father_strain))
         group by s2.id) x
 where x.id = s.id and s.package_tags = '{}';

-- tie phenos to METRC flowering plant tags in number order, per cross + hoop. Only phenos that are still growing and have
-- no tag yet; only tags no pheno has. A tag is a match when METRC has it in the pheno's lot (plant batch), or the same
-- strain in the same Mom House. Returns how many got a tag and the crosses where METRC has fewer / more plants.
create or replace function pheno_tie_tags(p_hunt bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int := 0; short jsonb; extra jsonb; lic text := 'CCL24-0000156';
begin
  perform no_view_as();
  if not (is_mod_admin('nursery') or is_admin()) then raise exception 'Only a Nursery Admin can tie tags'; end if;
  if not exists (select 1 from metrc_plants where license = lic) then raise exception 'No 1PN plants from METRC yet: pull from METRC first (Compliance > METRC)'; end if;
  create temp table _g on commit drop as
    select p.id, p.seed_lot_id, p.room_id, p.number, p.lot_tag, r.name room,
           seed_cross_key(concat_ws(' x ', s.mother_strain, s.father_strain)) k
      from phenos p join seed_lots s on s.id = p.seed_lot_id left join nursery_rooms r on r.id = p.room_id
     where p.hunt_id = p_hunt and p.status not in ('culled', 'male') and p.plant_tag is null;
  create temp table _t on commit drop as
    select m.label, m.batch, m.location,
           seed_cross_key(case upper(m.strain) when 'SS X IMPERIAL STOUT' then 'Scooby Snacks x Imperial Stout' when 'RBB X CS' then 'Rainbow Belts x Cherry Stout'
                                               when 'HB X IMPERIAL STOUT' then 'Honey Banana x Imperial Stout' else m.strain end) k
      from metrc_plants m
     where m.license = lic and m.phase = 'flowering' and not exists (select 1 from phenos q where upper(q.plant_tag) = upper(m.label));
  -- each tag goes to one group: its lot first, else strain + Mom House
  create temp table _tg on commit drop as
    select distinct on (t.label) t.label, g.seed_lot_id, g.room_id
      from _t t join _g g on (t.batch is not null and upper(t.batch) = upper(g.lot_tag))
                          or (t.k = g.k and lower(t.location) = lower(replace(g.room, 'Hoop ', 'Mom House ')))
     order by t.label, (t.batch is not null and upper(t.batch) = upper(g.lot_tag)) desc;
  with a as (select id, seed_lot_id, room_id, row_number() over (partition by seed_lot_id, room_id order by number) i from _g),
       b as (select label, seed_lot_id, room_id, row_number() over (partition by seed_lot_id, room_id order by label) i from _tg),
       u as (update phenos p set plant_tag = b.label, tag_confirmed = false, tag_source = 'metrc order'
               from a join b using (seed_lot_id, room_id, i) where p.id = a.id returning 1)
  select count(*) into n from u;
  select coalesce(jsonb_agg(jsonb_build_object('cross', c, 'where', w, 'phenos', a, 'tags', t) order by w, c) filter (where a > t), '[]'),
         coalesce(jsonb_agg(jsonb_build_object('cross', c, 'where', w, 'phenos', a, 'tags', t) order by w, c) filter (where t > a), '[]')
    into short, extra
    from (select concat_ws(' x ', s.mother_strain, s.father_strain) c, r.name w,
                 (select count(*) from _g g where g.seed_lot_id = x.seed_lot_id and g.room_id is not distinct from x.room_id) a,
                 (select count(*) from _tg z where z.seed_lot_id = x.seed_lot_id and z.room_id is not distinct from x.room_id) t
            from (select distinct seed_lot_id, room_id from _g) x join seed_lots s on s.id = x.seed_lot_id left join nursery_rooms r on r.id = x.room_id) y;
  insert into events (user_email, type, note, details) values (current_email(), 'nursery_pheno_tags', 'Tied ' || n || ' phenos to METRC tags (unconfirmed)', jsonb_build_object('hunt', p_hunt, 'tied', n));
  return jsonb_build_object('tied', n, 'short', short, 'extra', extra);
end $$;
revoke execute on function pheno_tie_tags(bigint) from public, anon;
grant execute on function pheno_tie_tags(bigint) to authenticated;

-- typing or scanning a tag on the plant confirms it; the tie above sets it unconfirmed
create or replace function pheno_tag_touch() returns trigger language plpgsql as $$
begin
  if new.plant_tag is distinct from old.plant_tag and coalesce(new.tag_source, '') <> 'metrc order' then new.tag_confirmed := new.plant_tag is not null; end if;
  if new.plant_tag is distinct from old.plant_tag and old.tag_source = 'metrc order' and new.tag_source = 'metrc order' and old.plant_tag is not null then
    new.tag_source := null; new.tag_confirmed := new.plant_tag is not null; end if;
  return new;
end $$;
drop trigger if exists phenos_tag_touch on phenos;
create trigger phenos_tag_touch before update of plant_tag on phenos for each row execute function pheno_tag_touch();

select (select count(*) from seed_lots where package_tags <> '{}') as lots_with_metrc_seed_package;
