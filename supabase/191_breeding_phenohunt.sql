-- Migration 191: Breeding fits the 2026 seed project and PhenoHunt26.
-- Seed lots keep what the Master List tracks (plants wanted, seeds sown). One hunt can hold many crosses: each pheno has its
-- seed lot (cross), hoop, bed, the METRC immature lot it came from, cuttings taken, and a cull reason. Numbers run per cross
-- (Euroz x Honey Banana #1, Gurple x Trop Cherry #1), and per hoop when a cross is split over two hoops. Grower observations by stage (pre-flip, mid flower, late flower) next to
-- the group 1-5 scores. Pollination runs can belong to a project, take receivers from cutting batches, and the project's
-- donor batches (A/B/C) have their own move dates. Run after 034. Safe to re-run. (Files 188-190 are carrier data from another session.)
set client_min_messages = warning;

-- ---------- seed lots ----------
alter table seed_lots add column if not exists season int;
alter table seed_lots add column if not exists target_plants int;     -- Master List "Amount"
alter table seed_lots add column if not exists sown int;              -- Master List "Amount to Sow"
alter table seed_lots add column if not exists sown_on date;
alter table seed_lots add column if not exists import_ref text;

-- ---------- hunts and phenos ----------
alter table pheno_hunts add column if not exists planted_on date;
alter table pheno_hunts add column if not exists import_ref text;
alter table phenos add column if not exists seed_lot_id bigint references seed_lots(id) on delete set null;
alter table phenos add column if not exists lot_tag text;             -- METRC immature plant batch it came from
alter table phenos add column if not exists planted_on date;
alter table phenos add column if not exists cut_on date;              -- cuttings taken off this pheno
alter table phenos add column if not exists cut_qty int;
alter table phenos add column if not exists cull_reason text;
alter table phenos add column if not exists culled_on date;
alter table phenos add column if not exists import_ref text;
alter table phenos drop constraint if exists phenos_hunt_id_number_key;
drop index if exists phenos_hunt_lot_number_uq;
create unique index if not exists phenos_hunt_lot_room_number_uq on phenos (hunt_id, coalesce(seed_lot_id, 0), coalesce(room_id, 0), number);   -- the same # can be in two hoops
create index if not exists phenos_hunt_idx on phenos (hunt_id, seed_lot_id);
create index if not exists phenos_lot_tag_idx on phenos (lot_tag);

-- grower observations: one record per pheno per stage (the group's notes, anyone in Nursery can update)
create table if not exists pheno_obs (
  id          bigserial primary key,
  pheno_id    bigint not null references phenos(id) on delete cascade,
  stage       text not null check (stage in ('seedling','veg','preflip','midflower','lateflower')),
  observed_on date not null default current_date,
  traits      jsonb not null default '{}',
  notes       text,
  observer    text default current_email(),
  updated_at  timestamptz not null default now(),
  unique (pheno_id, stage)
);
alter table pheno_obs enable row level security;
drop policy if exists n_read on pheno_obs; drop policy if exists n_add on pheno_obs; drop policy if exists n_edit on pheno_obs; drop policy if exists n_delete on pheno_obs;
create policy n_read on pheno_obs for select to authenticated using (has_module('nursery') or is_admin());
create policy n_add on pheno_obs for insert to authenticated with check (has_module('nursery') and not impersonating());
create policy n_edit on pheno_obs for update to authenticated using (has_module('nursery')) with check (has_module('nursery') and not impersonating());
create policy n_delete on pheno_obs for delete to authenticated using (has_module('nursery') and not impersonating());
grant select, insert, update, delete on pheno_obs to authenticated;
grant usage on sequence pheno_obs_id_seq to authenticated;

-- ---------- pollination runs ----------
alter table breed_runs add column if not exists project text;                 -- 2026 Seed Project
alter table breed_runs add column if not exists donor_batch_id bigint references nursery_batches(id) on delete set null;
alter table breed_receivers add column if not exists batch_id bigint references nursery_batches(id) on delete set null;
alter table breed_runs alter column donor_strain drop not null;              -- a run can be set up before its donor is picked

create table if not exists breed_donor_batches (
  id          bigserial primary key,
  project     text not null,
  label       text not null,                 -- Batch A
  strains     text,                          -- Rainbow Guava / Hashburger
  plants      int,
  cut_on      date,
  room_id     int references nursery_rooms(id) on delete set null,   -- where they flower (Trailer 3)
  to_room_on  date,                          -- transplanted into that trailer
  move_in_on  date,                          -- moved into the receiver trailers (pollination)
  notes       text,
  created_at  timestamptz not null default now(),
  unique (project, label)
);
alter table breed_donor_batches enable row level security;
drop policy if exists n_read on breed_donor_batches; drop policy if exists n_add on breed_donor_batches; drop policy if exists n_edit on breed_donor_batches; drop policy if exists n_delete on breed_donor_batches;
create policy n_read on breed_donor_batches for select to authenticated using (has_module('nursery') or is_admin());
create policy n_add on breed_donor_batches for insert to authenticated with check (has_module('nursery') and not impersonating());
create policy n_edit on breed_donor_batches for update to authenticated using (has_module('nursery')) with check (has_module('nursery') and not impersonating());
create policy n_delete on breed_donor_batches for delete to authenticated using (has_module('nursery') and not impersonating());
grant select, insert, update, delete on breed_donor_batches to authenticated;
grant usage on sequence breed_donor_batches_id_seq to authenticated;

-- audit the new tables the same way as the rest of Breeding
do $$
declare t text;
begin
  foreach t in array array['breed_donor_batches'] loop
    execute format('drop trigger if exists %I on %I', t || '_audit', t);
    execute format('create trigger %I before insert or update or delete on %I for each row execute function breed_audit()', t || '_audit', t);
  end loop;
end $$;

-- numbering: a hunt with many crosses numbers each cross on its own
drop function if exists pheno_hunt_number(bigint, int, text);
create or replace function pheno_hunt_number(p_hunt bigint, p_count int, p_prefix text, p_seed_lot bigint default null, p_room int default null, p_bed text default null) returns int
language plpgsql security definer set search_path = public as $$
declare h pheno_hunts; start int; n int := 0; lot bigint := coalesce(p_seed_lot, (select seed_lot_id from pheno_hunts where id = p_hunt));
begin
  perform no_view_as();
  if not has_module('nursery') then raise exception 'The Nursery module isn''t switched on for your account'; end if;
  select * into h from pheno_hunts where id = p_hunt;
  if h.id is null then raise exception 'Hunt not found'; end if;
  if coalesce(p_count, 0) <= 0 or p_count > 2000 then raise exception 'How many phenos?'; end if;
  select coalesce(max(number), 0) into start from phenos where hunt_id = p_hunt and coalesce(seed_lot_id, 0) = coalesce(lot, 0);
  insert into phenos (hunt_id, seed_lot_id, number, label, room_id, bed, planted_on)
  select p_hunt, lot, start + g, nullif(trim(coalesce(p_prefix, '')), '') || ' #' || (start + g), coalesce(p_room, h.room_id), nullif(trim(coalesce(p_bed, '')), ''), h.planted_on
    from generate_series(1, p_count) g;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function pheno_hunt_number(bigint, int, text, bigint, int, text) from public, anon;
grant execute on function pheno_hunt_number(bigint, int, text, bigint, int, text) to authenticated;

-- keeper lineage comes from the pheno's own cross when the hunt holds many
create or replace function pheno_keeper(p_pheno bigint, p_name text) returns phenos
language plpgsql security definer set search_path = public as $$
declare p phenos; h pheno_hunts; s seed_lots; nm text := nullif(trim(p_name), '');
begin
  perform no_view_as();
  if not has_module('nursery') then raise exception 'The Nursery module isn''t switched on for your account'; end if;
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
  update phenos set status = 'keeper', keeper_strain = coalesce(canonical_strain(nm), nm) where id = p.id returning * into p;
  return p;
end $$;

-- culled date fills itself
create or replace function pheno_cull_date() returns trigger language plpgsql as $$
begin
  if new.status in ('culled', 'male') and (tg_op = 'INSERT' or old.status is distinct from new.status) and new.culled_on is null and new.import_ref is null then new.culled_on := current_date; end if;
  if new.status not in ('culled', 'male') then new.culled_on := null; new.cull_reason := null; end if;
  return new;
end $$;
drop trigger if exists phenos_cull_date on phenos;
create trigger phenos_cull_date before insert or update of status on phenos for each row execute function pheno_cull_date();

select 'ok' as breeding_191;
