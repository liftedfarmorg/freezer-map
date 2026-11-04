-- RUN LIVE 11/3 by Claude in the SQL Editor (Aziz OK).
-- 170: no app item without a METRC item (Aziz 11/3).
-- Before: item_for() (054, 158) quietly made a new item in the app the first time a pallet needed one (a harvest, a processing
-- output, a product change), marked "to_create", and nothing ever sent it to METRC. That's how the app ended up with items
-- METRC didn't have.
-- Now: when item_for() makes a new item it also queues "Create item in METRC" for it on its license (and "Create strain in
-- METRC" first if METRC doesn't have the strain there), the same to-dos the strain's METRC sheet makes. Both kinds are on Auto,
-- so the worker sends them within a minute or so; METRC's reply saves the METRC ID and marks the item in METRC.
-- Category / unit: copied from a METRC item of the same kind on that license, else any license, else the sender's rules.
-- Safe to re-run.
begin;

create or replace function _item_to_metrc(p_item bigint) returns void
language plpgsql security definer set search_path = public as $$
declare it items; s strains; lic text; sname text; what_ text; mname text; cat text; sid bigint; aid bigint; ending text;
begin
  select * into it from items where id = p_item;
  if it.id is null or it.license is null then return; end if;
  select * into s from strains where id = it.strain_id;
  lic := it.license;
  sname := metrc_strain_on(s.id, lic);
  ending := ' - ' || split_part(it.metrc_name, ' - ', 3);
  cat := coalesce((select x.category from metrc_items x where x.license = lic and x.name like '%' || ending and not x.archived and x.category is not null limit 1),
                  (select x.category from metrc_items x where x.name like '%' || ending and not x.archived and x.category is not null limit 1));
  foreach what_ in array array['strain', 'item'] loop
    mname := case what_ when 'strain' then sname else it.metrc_name end;
    continue when what_ = 'strain' and exists (select 1 from metrc_strains x where x.license = lic and lower(x.name) = lower(sname) and not x.archived);
    continue when what_ = 'item' and exists (select 1 from metrc_items x where x.license = lic and lower(x.name) = lower(it.metrc_name) and not x.archived);
    continue when exists (select 1 from metrc_setup su where su.license = lic and su.what = what_ and lower(su.metrc_name) = lower(mname) and su.status in ('queued', 'in_metrc'));
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
                               'source', 'new app item (170)'),
            what_ || '_create')
    returning id into aid;
    update metrc_setup set action_id = aid where id = sid;
  end loop;
end $$;
revoke execute on function _item_to_metrc(bigint) from public, anon, authenticated;

-- item_for (158) + queue the new item to METRC
create or replace function item_for(p_year int, p_site text, p_finish text, p_strain int, p_cert text default 'OCAL', p_season text default 'FL') returns bigint
language plpgsql security definer set search_path = public as $$
declare i bigint; s text := coalesce(p_season, 'FL');
begin
  if p_year is null or p_site is null or p_finish is null or p_strain is null then return null; end if;
  if not exists (select 1 from sites where code = p_site and farm_code is not null) then return null; end if;
  select id into i from items where crop_year = p_year and season = s and site = p_site and cert = p_cert and finish = p_finish and strain_id = p_strain;
  if i is null then
    insert into items (sku, crop_year, season, site, cert, finish, strain_id, metrc_name, license, roshi_category, acct_class, uom)
    values (item_sku(p_year, p_site, p_cert, p_finish, p_strain, s), p_year, s, p_site, p_cert, p_finish, p_strain,
            item_metrc_name(p_year, p_site, p_cert, p_finish, p_strain, s),
            (select license from sites where code = p_site),
            (select name from finishes where code = p_finish) || ' - ' || p_year,
            case p_site when 'OHR' then '06_Oak Hill' when 'GVR' then '05_1363 GVR' end,
            (select uom from finishes where code = p_finish))
    on conflict (crop_year, season, site, cert, finish, strain_id) do nothing
    returning id into i;
    if i is not null then
      perform _item_to_metrc(i);   -- 170: a new item goes to METRC
    else
      select id into i from items where crop_year = p_year and season = s and site = p_site and cert = p_cert and finish = p_finish and strain_id = p_strain;
    end if;
  end if;
  return i;
end $$;
revoke execute on function item_for(int, text, text, int, text, text) from public, anon, authenticated;

commit;
