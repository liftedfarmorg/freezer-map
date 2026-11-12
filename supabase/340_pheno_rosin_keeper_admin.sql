-- Migration 340 (Msg PHENO-PIC-5; was 339, renumbered because NUR-12 also used 339, Aziz 11/11): pheno photos can be tagged Rosin; only a Nursery Admin (or app admin) can make a pheno a
-- Keeper, since that adds the name to the Strains list. Also (PHENO-SCORE-1) Leafiness score + pheno harvested_on, (STRAIN-INV-3) strains.grown_from seed/clone + fill-in. App only, nothing to METRC. Safe to re-run. Run after 339.
set client_min_messages = warning;

alter table pheno_photos drop constraint if exists pheno_photos_kind_check;
alter table pheno_photos add constraint pheno_photos_kind_check check (kind in ('plant','jar','bud','rosin','other'));

create or replace function pheno_keeper(p_pheno bigint, p_name text) returns phenos
language plpgsql security definer set search_path = public as $$
declare p phenos; h pheno_hunts; s seed_lots; nm text := nullif(trim(p_name), '');
begin
  perform no_view_as();
  if not (is_mod_admin('nursery') or is_admin()) then raise exception 'Only a Nursery Admin can pick a keeper'; end if;
  select * into p from phenos where id = p_pheno;
  if p.id is null then raise exception 'Pheno not found'; end if;
  nm := coalesce(nm, p.label);
  select * into h from pheno_hunts where id = p.hunt_id;
  select * into s from seed_lots where id = coalesce(p.seed_lot_id, h.seed_lot_id);
  if canonical_strain(nm) is null then
    insert into strains (name, lineage, breeder, active, notes)
    values (nm, nullif(concat_ws(' x ', s.mother_strain, s.father_strain), ''), coalesce(s.breeder, case when s.source = 'in-house' then 'Lifted (in house)' end), true,
            'Keeper from pheno hunt ' || h.name || ', ' || coalesce(p.label, '#' || p.number));
  end if;
  -- STRAIN-INV-3: a pheno keeper is kept as clones
  update strains set grown_from = 'clone' where name = coalesce(canonical_strain(nm), nm) and grown_from is null;
  update phenos set status = 'keeper', keeper_strain = coalesce(canonical_strain(nm), nm) where id = p.id returning * into p;
  return p;
end $$;
revoke execute on function pheno_keeper(bigint, text) from public, anon;
grant execute on function pheno_keeper(bigint, text) to authenticated;

-- PHENO-SCORE-1 (11/11): Leafiness is a scored trait (1-5, 5 = least leaf, easiest to trim). Phenos get a harvested_on date, filled in
-- by the app when the pheno is harvested (grower notes show it read only).
alter table pheno_scores add column if not exists leafiness smallint check (leafiness between 1 and 5);
alter table phenos add column if not exists harvested_on date;

-- STRAIN-INV-3 (11/11): strains can be marked as grown from Seed or Clone (one, like Type)
alter table strains add column if not exists grown_from text;
alter table strains drop constraint if exists strains_grown_from_chk;
alter table strains add constraint strains_grown_from_chk check (grown_from is null or grown_from in ('seed', 'clone'));

-- Fill in Grown from where it's blank (Aziz 11/11): a pheno number in the name (#18) = clone; else a cross (" x ") = seed;
-- else a pheno hunt keeper or a strain with nursery mothers = clone; anything else stays blank. Old values kept in strains_bak_340.
create table if not exists strains_bak_340 as select id, grown_from from strains;
update strains s set grown_from = case
    when s.name ~ '#\s*\d' then 'clone'
    when s.name ~* '\sx\s' then 'seed'
    when exists (select 1 from phenos p where p.status = 'keeper' and lower(p.keeper_strain) = lower(s.name))
      or exists (select 1 from nursery_mothers m where lower(m.strain) = lower(s.name) or lower(m.strain) = any(select lower(a) from unnest(s.aliases) a)) then 'clone'
    else null end
 where s.grown_from is null;

select 'rosin + keeper admin + leafiness + grown from ready' as done,
  (select count(*) from strains where grown_from = 'seed') as seed, (select count(*) from strains where grown_from = 'clone') as clone,
  (select count(*) from strains where grown_from is null) as blank;
-- undo the fill-in: update strains s set grown_from = b.grown_from from strains_bak_340 b where b.id = s.id;
