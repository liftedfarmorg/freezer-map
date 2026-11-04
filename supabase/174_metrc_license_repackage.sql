-- RUN LIVE 11/3 by Claude (Management API as Aziz): success, G4028 now on CCL21-0000679.
-- 174 (written as 172 before the other session's 172/173 landed): tag boxes use the license METRC has the package on + Repackage for processor returns (Aziz 11/3, msg 1103-B)
--  * Jelly Cake bucking run B-261030-1: input G4028 (CCP return, tag ...14028) is active in METRC on GVR processing CCL21-0000679,
--    but the tag box took the license from the user's site and said processing tag ...7193 was on the wrong list.
--  * metrc_license_of(pallet): the license METRC has the pallet's tag on (active), else the license of the event that received it,
--    else the old rule (freezer license, then site).
--  * tag_search: uses metrc_license_of for a pallet.
--  * new_package: now works on packages still on a processor's tag (Processing > Needs our tag > Repackage). All of it = repackage
--    onto our tag with the item picked; part of it = split a piece onto our tag (the rest stays on theirs). The METRC to-dos go to the
--    license METRC has the source package on.
begin;

create or replace function metrc_license_of(p_pallet bigint) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select m.license from pallets p join metrc_packages m on m.label = upper(p.package_tag)
      where p.id = p_pallet and m.state = 'active' order by m.seen_at desc nulls last limit 1),
    (select e.details ->> 'license' from events e where e.pallet_id = p_pallet and e.type in ('proc_return', 'processor_return_added', 'inbound_received')
      and e.details ? 'license' order by e.id desc limit 1),
    comp_pallet_license(p_pallet))
$$;
revoke all on function metrc_license_of(bigint) from public, anon;
grant execute on function metrc_license_of(bigint) to authenticated;

create or replace function tag_search(p_pallet bigint default null, p_slot bigint default null, p_site text default null, p_q text default null,
                                      p_purpose text default 'mixed', p_type text default 'package', p_count int default 200) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare lic text; tags text[]; stored boolean;
begin
  if not is_staff() then raise exception 'Not allowed'; end if;
  if p_pallet is not null then lic := metrc_license_of(p_pallet); end if;
  if lic is null and p_slot is not null then
    select coalesce(f.license, site_license(f.site)) into lic from slots s join freezers f on f.id = s.freezer_id where s.id = p_slot;
  end if;
  if lic is null and p_site is not null then lic := tag_license(p_site, p_purpose); end if;
  stored := lic is not null and exists (select 1 from metrc_tags where license = lic and tag_type = p_type);
  if stored then
    tags := metrc_find_tags(lic, p_type, p_purpose, p_q, p_count);
  elsif p_type = 'package' and p_site is not null then
    tags := next_tags(p_site, p_purpose, least(p_count, 200));
  else
    tags := '{}';
  end if;
  return jsonb_build_object('license', lic, 'tags', to_jsonb(coalesce(tags, '{}')), 'from_metrc', stored, 'q', p_q,
    'free', case when stored then (select count(*) from metrc_tags t where t.license = lic and t.tag_type = p_type and not exists (select 1 from app_used_tags() u where u.label = t.label)) end,
    'autofill', coalesce((select value from app_settings where key = 'comp.tag_autofill'), 'true') = 'true',
    'pulled', (select max(seen_at) from metrc_tags where license = lic));
end $$;
revoke all on function tag_search(bigint, bigint, text, text, text, text, int) from public, anon;
grant execute on function tag_search(bigint, bigint, text, text, text, text, int) to authenticated;

create or replace function new_package(
  p_pallet_id bigint, p_lbs numeric, p_tag text, p_tag_pending boolean default false, p_dest_slot int default null,
  p_item_id bigint default null, p_note text default null, p_keep_on_load boolean default false
) returns pallets
language plpgsql security definer set search_path = public as $$
declare p pallets; child pallets; tag text := upper(nullif(trim(p_tag), '')); used text; old text; lic text;
        it items; eid bigint; d jsonb; whole boolean; prod text;
begin
  perform require_staff();
  select * into p from pallets where id = p_pallet_id for update;
  if not found then raise exception 'Pallet not found'; end if;
  if p.current_weight is null then raise exception 'Pallet % has no weight. Adjust its weight first.', p.code; end if;
  if p_lbs is null or p_lbs <= 0 then raise exception 'Enter how many lbs go in the new package'; end if;
  if p_lbs > p.current_weight + 0.0001 then raise exception '% only has % lbs', p.code, p.current_weight; end if;
  if p_item_id is not null then
    select * into it from items where id = p_item_id;
    if it.id is null then raise exception 'Item not found'; end if;
    -- the product follows the item (133/134: a trim item makes it trim)
    prod := case it.finish when 'FF' then 'fresh_frozen' when 'UF' then 'unbucked' when 'BF' then 'bucked' when 'BS' then 'bucked_standards'
                           when 'ST' then 'standards' when 'SM' then 'smalls' when 'TR' then 'trim' end;
  end if;
  whole := p_lbs >= p.current_weight - 0.0001;

  if not whole then
    -- part of it: the split, then the new piece gets the item
    lic := metrc_license_of(p.id);
    child := split_pallet(p_pallet_id, p_lbs, tag, p_tag_pending, p_dest_slot, p_note, true, p_keep_on_load);
    -- 172: the piece is on our tag (even when the source is still on a processor's tag); its split goes to the license METRC has the source on
    if coalesce(child.their_tag, false) then update pallets set their_tag = false, updated_at = now() where id = child.id returning * into child; end if;
    if lic is not null then
      update comp_metrc_actions set license = lic where pallet_id = child.id and kind = 'split' and status in ('todo', 'error') and license is distinct from lic;
    end if;
    if it.id is not null and it.id is distinct from child.item_id then
      update pallets set item_id = it.id, product = coalesce(prod, product), updated_at = now() where id = child.id returning * into child;
      update comp_metrc_actions set details = details || jsonb_build_object('item_id', it.id, 'item_name', it.metrc_name)
       where pallet_id = child.id and kind = 'split' and status in ('todo', 'error');
    end if;
    return child;
  end if;

  -- all of it: same pallet, new tag
  perform assert_loose(p, 'repackaged');
  if p.kind = 'mixed' then raise exception '% is a mixed pallet. Repackage one of the packages on it instead.', p.code; end if;
  if p.status not in ('in_freezer', 'unslotted') then raise exception '% is %. Only a package in a freezer or unslotted can be repackaged.', p.code, replace(p.status, '_', ' '); end if;
  if p.package_tag is null then raise exception '% has no METRC tag yet, so there''s nothing to repackage. Enter its tag instead.', p.code; end if;
  if tag is null then raise exception 'Enter the new METRC tag'; end if;
  if tag = upper(p.package_tag) then raise exception '% is already on %', p.code, tag; end if;
  used := tag_in_use(tag, p.id);
  if used is not null then raise exception 'Tag % is already on pallet %', tag, used; end if;
  if tag_available(tag) is false then raise exception 'Tag % isn''t on METRC''s available list. It''s used, voided or never issued.', tag; end if;
  if exists (select 1 from comp_metrc_actions a where a.pallet_id = p.id and a.kind = 'repackage' and a.status in ('todo', 'error')) then
    raise exception '% already has a repackage waiting in the METRC to-do list. Send or clear that one first.', p.code;
  end if;

  old := upper(p.package_tag);
  lic := metrc_license_of(p.id);
  d := jsonb_strip_nulls(jsonb_build_object('type', 'repackage', 'from', old, 'to', tag, 'code', p.code, 'strain', p.strain, 'product', p.product,
         'lbs', p.current_weight, 'item_id', it.id, 'item_name', it.metrc_name,
         'item_from', (select metrc_name from items where id = p.item_id), 'their_tag', case when coalesce(p.their_tag, false) then true end, 'by', current_email()));
  update pallets set package_tag = tag, tag_pending = false, their_tag = false, item_id = coalesce(it.id, item_id), product = coalesce(prod, product), updated_at = now()
   where id = p.id returning * into p;
  insert into events (user_email, type, pallet_id, from_slot_id, to_slot_id, lbs, note, details)
  values (current_email(), 'repackage', p.id, p.slot_id, p.slot_id, p.current_weight,
          coalesce(nullif(trim(p_note), ''), 'New package ' || tag || ' (was ' || old || ')'), d)
  returning id into eid;
  insert into comp_metrc_actions (event_id, at, license, kind, action, pallet_id, code, tag, lbs, summary, details)
  values (eid, now(), lic, 'repackage', 'New package (whole package onto a new tag)', p.id, p.code, tag, p.current_weight,
          concat_ws(' · ', p.code, p.strain, 'from ' || old), d || jsonb_build_object('note', p_note))
  on conflict (event_id) do nothing;
  return p;
end $$;
revoke all on function new_package(bigint, numeric, text, boolean, int, bigint, text, boolean) from public, anon;
grant execute on function new_package(bigint, numeric, text, boolean, int, bigint, text, boolean) to authenticated;

commit;

select '174' as ok, (select code from pallets where id = 2050) as pallet, metrc_license_of(2050) as license_now;
