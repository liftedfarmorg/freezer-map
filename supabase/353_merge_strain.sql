-- Migration 353 (FB-0024, Mavrik; Msg FBQ-3): merge one strain into another (e.g. MBxBP x Pressure #6 into Violet Torque).
-- Aziz 11/12: module Admins can merge (may be temporary). History keeps the old name; live records move.
--
-- merge_strain(from, into, dry_run default true):
--   dry run: counts what would move, per table. Changes nothing.
--   real run:
--   * live records using the old name (or one of its other names) are renamed to the kept strain:
--     pallets, reserves, reserve requests, lines on OPEN orders (draft / pending / submitted), cultivation plan, demand,
--     nursery deliveries, receipts, plantings, harvests (strain only; planted_strain stays), flower picks,
--     nursery mothers / batches / plantings / plan / tests, breeding receivers and donor runs, pheno keepers, seed lots,
--     processing requests, the METRC strain map (app side). Each table's count goes to the events log.
--   * history keeps the old name: invoices, credit memos, returns, lines on closed orders, yield history, processing runs,
--     logs, piece rate, nursery pot events, every METRC copy (metrc_*), items and item prices, harvest lots.
--     Those still resolve to the kept strain through its Other names.
--   * strain profile (photo, yields, notes...): blanks on the kept strain are filled from the old one.
--   * the old name and its other names become Other names on the kept strain.
--   * the old strain is retired, not deleted: inactive, renamed "<old> [merged into <kept>]" so the old name resolves
--     to the kept strain everywhere (canonical_strain prefers an exact name).
--   * nothing in METRC.
-- Safe to re-run (create or replace).

create or replace function merge_strain(p_from int, p_into int, p_dry_run boolean default true) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  f strains; k strains; names text[]; n int; out jsonb := '{}'; t record; cols text; merged jsonb;
  live constant text[][] := array[
    ['pallets', 'strain', ''], ['reserves', 'strain', ''], ['reserve_requests', 'strain', ''],
    ['order_lines', 'strain', ' and order_id in (select id from orders where status in (''draft'', ''pending'', ''submitted''))'],
    ['cult_plan', 'strain', ''], ['cult_demand', 'strain', ''], ['cult_nursery_orders', 'strain', ''], ['cult_receipts', 'strain', ''],
    ['cult_plantings', 'strain', ''], ['cult_harvests', 'strain', ''], ['cult_flower_picks', 'strain', ''],
    ['nursery_mothers', 'strain', ''], ['nursery_batches', 'strain', ''], ['nursery_plantings', 'strain', ''],
    ['nursery_strain_plan', 'strain', ''], ['nursery_tests', 'strain', ''],
    ['breed_receivers', 'strain', ''], ['breed_runs', 'donor_strain', ''], ['phenos', 'keeper_strain', ''],
    ['seed_lots', 'mother_strain', ''], ['seed_lots', 'father_strain', ''],
    ['proc_requests', 'strain', ''], ['metrc_strain_map', 'app_strain', '']];
  i int;
begin
  perform no_view_as();
  if not (is_any_admin() or is_owner()) then raise exception 'Only a module Admin can merge strains'; end if;
  select * into f from strains where id = p_from;
  select * into k from strains where id = p_into;
  if f.id is null or k.id is null then raise exception 'Pick both strains'; end if;
  if f.id = k.id then raise exception 'Pick two different strains'; end if;
  names := array(select distinct lower(trim(x)) from unnest(f.name || coalesce(f.aliases, '{}')) x where trim(x) <> '');

  for i in 1 .. array_length(live, 1) loop
    if to_regclass(live[i][1]) is null then continue; end if;
    if p_dry_run then
      execute format('select count(*) from %I where lower(trim(%I)) = any($1)%s', live[i][1], live[i][2], live[i][3]) into n using names;
    else
      execute format('update %I set %I = $2 where lower(trim(%I)) = any($1)%s', live[i][1], live[i][2], live[i][2], live[i][3]) using names, k.name;
      get diagnostics n = row_count;
    end if;
    if n > 0 then out := out || jsonb_build_object(live[i][1] || case when live[i][2] not in ('strain') then '.' || live[i][2] else '' end, n); end if;
  end loop;

  -- what stays under the old name (history), for the report
  out := out || jsonb_build_object('history_kept', jsonb_strip_nulls(jsonb_build_object(
    'invoice_lines', nullif((select count(*) from invoice_lines where lower(trim(strain)) = any(names)), 0),
    'closed_order_lines', nullif((select count(*) from order_lines l join orders o on o.id = l.order_id where lower(trim(l.strain)) = any(names) and o.status not in ('draft', 'pending', 'submitted')), 0),
    'items', nullif((select count(*) from items where strain_id = f.id), 0),
    'yield_history', nullif((select count(*) from cult_yield_history where lower(trim(strain)) = any(names)), 0))));

  if p_dry_run then
    return jsonb_build_object('dry_run', true, 'from', f.name, 'into', k.name, 'counts', out,
      'profile', (select count(*) from strain_info where strain_id = f.id), 'aliases_added', to_jsonb(f.name || coalesce(f.aliases, '{}')));
  end if;

  -- strain profile: fill the kept strain's blanks from the old one
  if exists (select 1 from strain_info where strain_id = f.id) then
    if not exists (select 1 from strain_info where strain_id = k.id) then
      update strain_info set strain_id = k.id where strain_id = f.id;
    else
      merged := (select to_jsonb(o) || jsonb_strip_nulls(to_jsonb(x)) from strain_info o, strain_info x where o.strain_id = f.id and x.strain_id = k.id);
      select string_agg(format('%I = (jsonb_populate_record(null::strain_info, $1)).%I', column_name, column_name), ', ') into cols
        from information_schema.columns where table_schema = 'public' and table_name = 'strain_info' and column_name <> 'strain_id';
      execute format('update strain_info set %s where strain_id = $2', cols) using merged, k.id;
    end if;
    out := out || jsonb_build_object('profile', 'merged');
  end if;
  -- blanks on the strain record itself
  update strains s set lineage = coalesce(s.lineage, f.lineage), color = coalesce(s.color, f.color), notes = coalesce(s.notes, f.notes),
         strain_type = coalesce(s.strain_type, f.strain_type)
   where s.id = k.id;

  -- retire the old strain under a new name, then give its names to the kept one
  update strains set name = left(f.name || ' [merged into ' || k.name || ']', 200), aliases = '{}', active = false where id = f.id;
  update strains set aliases = array(select distinct x from unnest(coalesce(aliases, '{}') || f.name || coalesce(f.aliases, '{}')) x
                                       where lower(x) <> lower(k.name))
   where id = k.id;

  insert into events (user_email, type, note, details)
  values (current_email(), 'strain_merged', f.name || ' -> ' || k.name, jsonb_build_object('from_id', f.id, 'into_id', k.id, 'from', f.name, 'into', k.name, 'counts', out));
  return jsonb_build_object('dry_run', false, 'from', f.name, 'into', k.name, 'counts', out);
end $$;
revoke all on function merge_strain(int, int, boolean) from public, anon;
grant execute on function merge_strain(int, int, boolean) to authenticated;

select 'merge_strain ready' as done, to_regprocedure('merge_strain(int, int, boolean)') is not null as ok;
