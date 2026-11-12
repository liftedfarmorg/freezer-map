-- 343 (Msg POT-2): containers (trays and pots) and the plant life cycle: what pot a lot was planted in, up-potting, history.
-- Nothing here goes to METRC (METRC doesn't track containers). A move done with an up-pot uses the existing move (339) for plantings.
-- Safe to run more than once.

-- ---------- 1. the containers list (Nursery > Settings > Containers) ----------
create table if not exists nursery_containers (
  id          serial primary key,
  name        text not null unique,
  short       text,                                     -- for tables: 72c, 2", 1G
  kind        text not null default 'pot' check (kind in ('tray','pot')),
  cells       int  not null default 1 check (cells > 0), -- plants per container (72 for a 72 cell tray, 1 for a pot)
  size_rank   int  not null default 0,                  -- smallest first; up-potting only goes to a bigger rank
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
-- 50 cell trays exist but aren't in use (switch on in Settings when they are)
insert into nursery_containers (name, short, kind, cells, size_rank, active) values
  ('72 cell tray', '72c', 'tray', 72, 10, true), ('50 cell tray', '50c', 'tray', 50, 12, false),
  ('Rose Pots', 'Rose', 'pot', 1, 20, true), ('2 Inch Pots', '2"', 'pot', 1, 30, true), ('4 Inch Pots', '4"', 'pot', 1, 40, true),
  ('Half Gallon Pots', '½G', 'pot', 1, 50, true), ('One Gallon Pots', '1G', 'pot', 1, 60, true), ('10L Bato', '10L', 'pot', 1, 70, true), ('25L Bato', '25L', 'pot', 1, 80, true)
on conflict (name) do nothing;

alter table nursery_containers enable row level security;
drop policy if exists n_read on nursery_containers; drop policy if exists n_write on nursery_containers;
create policy n_read on nursery_containers for select to authenticated using (has_module('nursery') or has_module('cultivation') or is_admin());
create policy n_write on nursery_containers for all to authenticated using ((is_admin() or is_mod_admin('nursery')) and not impersonating())
  with check ((is_admin() or is_mod_admin('nursery')) and not impersonating());
revoke all on nursery_containers from anon;
grant select, insert, update, delete on nursery_containers to authenticated;
grant usage, select on sequence nursery_containers_id_seq to authenticated;
grant all on nursery_containers to service_role;

-- ---------- 2. what each lot is in ----------
-- container_id = what the lot is in; up_n / up_to = plants already up-potted when only part of the lot was done (the rest still in container_id)
alter table nursery_batches   add column if not exists container_id int references nursery_containers(id);
alter table nursery_mothers   add column if not exists container_id int references nursery_containers(id);
alter table nursery_mothers   add column if not exists up_n int;
alter table nursery_mothers   add column if not exists up_to int references nursery_containers(id);
alter table nursery_plantings add column if not exists container_id int references nursery_containers(id);
alter table nursery_plantings add column if not exists up_n int;
alter table nursery_plantings add column if not exists up_to int references nursery_containers(id);

-- cuttings: every package that's still in the nursery is in 72 cell trays (the only tray in use)
update nursery_batches set container_id = (select id from nursery_containers where name = '72 cell tray')
 where container_id is null and stage in ('rooting','ready');
-- mother lots: read the old free-text Pot (4", 1G, 10L ...) where it clearly matches
update nursery_mothers m set container_id = c.id from nursery_containers c
 where m.container_id is null and m.pot is not null and c.id = (select id from nursery_containers where name = case
   when m.pot ~* '25 ?l' then '25L Bato' when m.pot ~* '10 ?l' then '10L Bato'
   when m.pot ~* '(half|1/2|½|\.5) ?(g|gal)' then 'Half Gallon Pots' when m.pot ~* '^\s*1 ?(g|gal)' then 'One Gallon Pots'
   when m.pot ~* '4 ?("|in|inch)' then '4 Inch Pots' when m.pot ~* '2 ?("|in|inch)' then '2 Inch Pots' when m.pot ~* 'rose' then 'Rose Pots' end);

-- Aziz 11/12: everything in the mom houses (hoops) is in 25L; all donors and receivers are in 10L. The rest gets fixed as they go.
update nursery_mothers set container_id = (select id from nursery_containers where name = '25L Bato')
 where container_id is null and status = 'active' and room_id in (select id from nursery_rooms where kind = 'hoop');
update nursery_plantings set container_id = (select id from nursery_containers where name = '10L Bato')
 where container_id is null and use in ('receivers','donors');

-- ---------- 3. history ----------
create table if not exists nursery_pot_events (
  id          bigserial primary key,
  lot_kind    text not null check (lot_kind in ('mother','planting')),
  lot_id      bigint not null,
  what        text not null default 'up_pot' check (what in ('planted','up_pot','fix')),
  strain      text,
  plant_tag   text,
  from_id     int references nursery_containers(id),
  to_id       int references nursery_containers(id),
  plants      int,
  room_from   int,
  room_to     int,
  on_date     date not null default current_date,
  note        text,
  done_by     text not null default current_email(),
  created_at  timestamptz not null default now()
);
create index if not exists nursery_pot_events_lot on nursery_pot_events (lot_kind, lot_id, on_date);
alter table nursery_pot_events enable row level security;
drop policy if exists n_read on nursery_pot_events;
create policy n_read on nursery_pot_events for select to authenticated using (has_module('nursery') or is_admin());
revoke all on nursery_pot_events from anon;
grant select on nursery_pot_events to authenticated;
grant all on nursery_pot_events to service_role;

-- ---------- 4. pot / up pot ----------
-- p_items = [{kind: 'mother'|'planting', id, plants}], p_to = the container, p_what = 'planted' (pot at planting) or 'up_pot'.
-- Up-potting goes to a bigger size only (sizes can be skipped). Part of a lot can go today and the rest later (into the same size).
create or replace function nursery_pot(p_items jsonb, p_to int, p_what text default 'up_pot', p_on date default null, p_note text default null, p_room int default null) returns int
language plpgsql security definer set search_path = public as $$
declare it jsonb; tc nursery_containers; cur nursery_containers; m nursery_mothers; p nursery_plantings;
        k text; live int; n int; cid int; fromc int; un int; ut int; strain text; tag text; rm int; done int := 0;
begin
  perform no_view_as();
  if not (has_module('nursery') or is_admin()) then raise exception 'The Nursery module isn''t switched on for your account'; end if;
  select * into tc from nursery_containers where id = p_to;
  if tc.id is null then raise exception 'Pick the pot'; end if;
  if p_what not in ('planted','up_pot') then raise exception 'Unknown pot step %', p_what; end if;
  perform set_config('nursery.move_on', coalesce(p_on, current_date)::text, true);   -- 344: a mother lot moved with an up-pot goes to METRC with this date
  for it in select * from jsonb_array_elements(p_items) loop
    k := it ->> 'kind';
    if k = 'mother' then
      select * into m from nursery_mothers where id = (it ->> 'id')::bigint for update;
      if m.id is null then raise exception 'Mother lot not found'; end if;
      live := greatest(0, coalesce(m.qty, 0) - coalesce(m.lost, 0)); cid := m.container_id; un := m.up_n; ut := m.up_to; strain := m.strain; tag := m.plant_tag; rm := m.room_id;
    elsif k = 'planting' then
      select * into p from nursery_plantings where id = (it ->> 'id')::bigint for update;
      if p.id is null then raise exception 'Planting not found'; end if;
      live := coalesce(p.flipped_n, p.plants); cid := p.container_id; un := p.up_n; ut := p.up_to; strain := p.strain; tag := p.plant_tag; rm := p.room_id;
    else raise exception 'Unknown lot kind %', k; end if;

    fromc := case when p_what = 'planted' then null else cid end;
    if p_what = 'planted' then
      n := live; cid := tc.id; un := null; ut := null;
    else
      n := coalesce(nullif(it ->> 'plants', '')::int, live - coalesce(un, 0));
      if n <= 0 then raise exception '%: how many plants?', strain; end if;
      if n > live - coalesce(un, 0) then raise exception '%: only % plants left to up-pot', strain, live - coalesce(un, 0); end if;
      cur := null; select * into cur from nursery_containers where id = cid;
      if cur.id is not null and tc.size_rank <= cur.size_rank then raise exception '%: % is not bigger than % (up-potting only goes up)', strain, tc.name, cur.name; end if;
      if ut is not null and ut <> tc.id then raise exception '%: part of this lot already went into %. Put the rest into the same pot.', strain, (select name from nursery_containers where id = ut); end if;
      if coalesce(un, 0) + n >= live then cid := tc.id; un := null; ut := null;   -- the whole lot is in the new pot now
      else un := coalesce(un, 0) + n; ut := tc.id; end if;
    end if;

    if k = 'mother' then update nursery_mothers set container_id = cid, up_n = un, up_to = ut, room_id = coalesce(p_room, room_id) where id = m.id;
    else update nursery_plantings set container_id = cid, up_n = un, up_to = ut where id = p.id; end if;   -- planting moves go through nursery_move (METRC)
    insert into nursery_pot_events (lot_kind, lot_id, what, strain, plant_tag, from_id, to_id, plants, room_from, room_to, on_date, note)
    values (k, (it ->> 'id')::bigint, p_what, strain, tag, fromc, tc.id, n, rm, coalesce(p_room, rm), coalesce(p_on, current_date), nullif(trim(coalesce(p_note, '')), ''));
    done := done + 1;
  end loop;
  insert into events (user_email, type, note, details) values (current_email(), case p_what when 'planted' then 'nursery_potted' else 'nursery_up_potted' end, tc.name,
    jsonb_build_object('items', p_items, 'to', tc.name, 'room_id', p_room, 'n', done));
  return done;
end $$;
revoke all on function nursery_pot(jsonb, int, text, date, text, int) from public, anon;
grant execute on function nursery_pot(jsonb, int, text, date, text, int) to authenticated;
