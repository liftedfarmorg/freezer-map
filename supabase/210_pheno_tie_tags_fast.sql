-- Migration 210: "Tie tags from METRC" (194) timed out on PhenoHunt26 (3,274 phenos x 2,628 METRC plants: the join compared
-- every plant with every pheno). Now it matches tags to cross + hoop groups (about 80) with plain equal joins.
-- A tag's lot (METRC plant batch) wins; if the same lot is in two hoops, the hoop that matches its Mom House wins.
-- Same rules otherwise: growing phenos without a tag, tags no pheno has, #1 = lowest tag, unconfirmed. Run after 194.
set client_min_messages = warning;

create or replace function pheno_tie_tags(p_hunt bigint) returns jsonb
language plpgsql security definer set search_path = public as $$
declare n int := 0; short jsonb; extra jsonb; lic text := 'CCL24-0000156';
begin
  perform no_view_as();
  if not (is_mod_admin('nursery') or is_admin()) then raise exception 'Only a Nursery Admin can tie tags'; end if;
  if not exists (select 1 from metrc_plants where license = lic) then raise exception 'No 1PN plants from METRC yet: pull from METRC first (Compliance > METRC)'; end if;
  drop table if exists _g, _grp, _t, _tg;
  create temp table _g on commit drop as
    select p.id, p.seed_lot_id, p.room_id, p.number, upper(p.lot_tag) bt,
           lower(replace(r.name, 'Hoop ', 'Mom House ')) house,
           seed_cross_key(concat_ws(' x ', s.mother_strain, s.father_strain)) k
      from phenos p join seed_lots s on s.id = p.seed_lot_id left join nursery_rooms r on r.id = p.room_id
     where p.hunt_id = p_hunt and p.status not in ('culled', 'male') and p.plant_tag is null;
  create temp table _grp on commit drop as select distinct seed_lot_id, room_id, bt, house, k from _g;
  create temp table _t on commit drop as
    select m.label, upper(m.batch) bt, lower(m.location) loc,
           seed_cross_key(case upper(m.strain) when 'SS X IMPERIAL STOUT' then 'Scooby Snacks x Imperial Stout' when 'RBB X CS' then 'Rainbow Belts x Cherry Stout'
                                               when 'HB X IMPERIAL STOUT' then 'Honey Banana x Imperial Stout' else m.strain end) k
      from metrc_plants m
     where m.license = lic and m.phase = 'flowering'
       and not exists (select 1 from phenos q where q.plant_tag is not null and upper(q.plant_tag) = upper(m.label));
  analyze _g; analyze _grp; analyze _t;
  create temp table _tg on commit drop as
    select distinct on (label) label, seed_lot_id, room_id from (
      select t.label, g.seed_lot_id, g.room_id, case when g.house = t.loc then 0 else 1 end pri from _t t join _grp g on g.bt = t.bt
      union all
      select t.label, g.seed_lot_id, g.room_id, 2 from _t t join _grp g on g.k = t.k and g.house = t.loc
    ) x order by label, pri;
  with a as (select id, seed_lot_id, room_id, row_number() over (partition by seed_lot_id, room_id order by number) i from _g),
       b as (select label, seed_lot_id, room_id, row_number() over (partition by seed_lot_id, room_id order by label) i from _tg),
       u as (update phenos p set plant_tag = b.label, tag_confirmed = false, tag_source = 'metrc order'
               from a join b on b.seed_lot_id = a.seed_lot_id and b.room_id is not distinct from a.room_id and b.i = a.i
              where p.id = a.id returning 1)
  select count(*) into n from u;
  with ga as (select seed_lot_id, room_id, count(*) a from _g group by 1, 2),
       tb as (select seed_lot_id, room_id, count(*) t from _tg group by 1, 2),
       y as (select concat_ws(' x ', s.mother_strain, s.father_strain) c, r.name w, coalesce(ga.a, 0) a, coalesce(tb.t, 0) t
               from ga full join tb on tb.seed_lot_id = ga.seed_lot_id and tb.room_id is not distinct from ga.room_id
               join seed_lots s on s.id = coalesce(ga.seed_lot_id, tb.seed_lot_id) left join nursery_rooms r on r.id = coalesce(ga.room_id, tb.room_id))
  select coalesce(jsonb_agg(jsonb_build_object('cross', c, 'where', w, 'phenos', a, 'tags', t) order by w, c) filter (where a > t), '[]'),
         coalesce(jsonb_agg(jsonb_build_object('cross', c, 'where', w, 'phenos', a, 'tags', t) order by w, c) filter (where t > a), '[]')
    into short, extra from y;
  insert into events (user_email, type, note, details) values (current_email(), 'nursery_pheno_tags', 'Tied ' || n || ' phenos to METRC tags (unconfirmed)',
    jsonb_build_object('hunt', p_hunt, 'tied', n, 'short', short, 'extra', extra));
  return jsonb_build_object('tied', n, 'short', short, 'extra', extra);
end $$;
revoke execute on function pheno_tie_tags(bigint) from public, anon;
grant execute on function pheno_tie_tags(bigint) to authenticated;
select 'ok' as pheno_tie_tags_210;
