-- 182: METRC to-dos for pallets that aren't in a slot got no license (Msg SPLIT-1, 11/4).
-- Rama's "New package (split)" to-dos 758 (T037-1), 769 (T036-1), 776 (T045-1), 777 (T046-1) for Bear Labs SO-26110301 failed with
-- "Missing or empty query parameter: licenseNumber": the pallets are unslotted at OHR and received_site is only set at GVR,
-- so comp_pallet_license() found no license.
-- Fix: comp_pallet_license falls back to the license METRC has the package on (the parent's package for a split piece),
-- then the site the pallet came from. The 4 to-dos get CCL25-0000017 (where METRC has the parent packages, all active).
-- Nothing is sent to METRC here: the to-dos still need Send. Run live by Claude 11/4. Safe to re-run.
begin;

create or replace function comp_pallet_license(p_pallet bigint) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(
    -- the freezer it's in (or its mixed pallet's freezer)
    (select f.license from pallets p join slots s on s.id = coalesce(p.slot_id, (select c.slot_id from pallets c where c.id = p.container_id))
       join freezers f on f.id = s.freezer_id where p.id = p_pallet),
    -- the site it was received at
    (select site_license(pallet_site(p)) from pallets p where p.id = p_pallet),
    -- 182: where METRC has its package (a split piece: its parent's package)
    (select m.license from pallets p join pallets src on src.id = coalesce(p.parent_id, p.id)
       join metrc_packages m on upper(m.label) = upper(src.package_tag)
      where p.id = p_pallet and m.state = 'active' order by m.seen_at desc nulls last limit 1),
    (select m.license from pallets p join metrc_packages m on upper(m.label) = upper(p.package_tag)
      where p.id = p_pallet and m.state = 'active' order by m.seen_at desc nulls last limit 1),
    -- 182: the site it came from (OHR / GVR)
    (select site_license(split_part(p.origin_site, '+', 1)) from pallets p where p.id = p_pallet))
$$;

update comp_metrc_actions a set license = comp_pallet_license(a.pallet_id)
 where a.id in (758, 769, 776, 777) and a.license is null and a.status in ('todo', 'error');

select id, code, license, push_state from comp_metrc_actions where id in (758, 769, 776, 777) order by id;
commit;
