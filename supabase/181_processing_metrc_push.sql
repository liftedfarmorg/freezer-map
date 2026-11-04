-- RUN LIVE 11/4 by Claude (Management API as Aziz): success. Kinds ready, mode still Off.
-- 181: METRC push for processing runs (phase 4 + 5): Processing outputs, Processing inputs used, Run waste / moisture loss.
--  Senders in api/metrc/_proc.js. Kinds become sendable (ready); their mode stays Off until Aziz picks Approve or Auto in
--  Compliance > METRC > What the app sends.
--  metrc_queue_item_on(item, license): queue Create strain / Create item in METRC for an app item on a given license (a bucked or
--  trim item at GVR processing, say), returns the Create item to-do id. Called by the proc_output sender when the item is missing.
begin;

create or replace function metrc_queue_item_on(p_item bigint, p_license text) returns bigint
language plpgsql security definer set search_path = public as $$
declare it items; s strains; lic text; last_id bigint; sname text; what_ text; mname text; cat text; sid bigint; aid bigint; ending text;
begin
  select * into it from items where id = p_item;
  if it.id is null or p_license is null then return null; end if;
  select * into s from strains where id = it.strain_id;
  lic := p_license;
  sname := metrc_strain_on(s.id, lic);
  ending := ' - ' || split_part(it.metrc_name, ' - ', 3);
  cat := coalesce((select x.category from metrc_items x where x.license = lic and x.name like '%' || ending and not x.archived and x.category is not null limit 1),
                  (select x.category from metrc_items x where x.name like '%' || ending and not x.archived and x.category is not null limit 1));
  foreach what_ in array array['strain', 'item'] loop
    mname := case what_ when 'strain' then sname else it.metrc_name end;
    continue when what_ = 'strain' and exists (select 1 from metrc_strains x where x.license = lic and lower(x.name) = lower(sname) and not x.archived);
    continue when what_ = 'item' and exists (select 1 from metrc_items x where x.license = lic and lower(x.name) = lower(it.metrc_name) and not x.archived);
    if exists (select 1 from metrc_setup su where su.license = lic and su.what = what_ and lower(su.metrc_name) = lower(mname) and su.status in ('queued', 'in_metrc')) then
      last_id := coalesce((select su.action_id from metrc_setup su where su.license = lic and su.what = what_ and lower(su.metrc_name) = lower(mname) limit 1), last_id);
      continue;
    end if;
    insert into metrc_setup (strain_id, license, what, metrc_name, finish, crop_year, site, item_id, category, uom, status)
    values (s.id, lic, what_, mname, case when what_ = 'item' then it.finish end, case when what_ = 'item' then it.crop_year end,
            case when what_ = 'item' then it.site end, case when what_ = 'item' then it.id end,
            case when what_ = 'item' then cat end, case when what_ = 'item' then 'Pounds' end, 'queued')
    on conflict (license, what, lower(metrc_name)) do update set status = 'queued', item_id = excluded.item_id,
           category = excluded.category, uom = excluded.uom, updated_at = now()
    returning id into sid;
    insert into comp_metrc_actions (license, action, summary, details, kind)
    values (lic, case what_ when 'strain' then 'Create strain in METRC' else 'Create item in METRC' end,
            case what_ when 'strain' then 'Strain ' || mname else mname end,
            jsonb_build_object('type', what_ || '_create', 'strain_id', s.id, 'strain', s.name, 'setup_id', sid, 'name', mname,
                               'strain_name', sname, 'finish', it.finish, 'crop_year', it.crop_year, 'farm', it.site,
                               'category', case when what_ = 'item' then cat end, 'uom', case when what_ = 'item' then 'Pounds' end,
                               'license_kind', (select kind from licenses where license_no = lic),
                               'testing', s.metrc_testing, 'thc', s.metrc_thc, 'cbd', s.metrc_cbd, 'indica', s.metrc_indica, 'sativa', s.metrc_sativa,
                               'source', 'processing output on this license (181)'),
            what_ || '_create')
    returning id into aid;
    update metrc_setup set action_id = aid where id = sid;
    last_id := aid;
  end loop;
  return last_id;
end $$;
revoke all on function metrc_queue_item_on(bigint, text) from public, anon, authenticated;
grant execute on function metrc_queue_item_on(bigint, text) to service_role;

update metrc_push_kinds set ready = true where kind in ('proc_output', 'proc_used', 'run_waste');

commit;

select '181' as ok, (select string_agg(kind || ':' || mode || ':' || ready, ', ') from metrc_push_kinds where kind in ('proc_output', 'proc_used', 'run_waste')) as kinds;
