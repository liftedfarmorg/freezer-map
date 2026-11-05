-- 205: P81 (Papaya Bomb, 11.28 lb) back to GVR in the app (Msg R-211, 11/4). App only, nothing to METRC.
-- METRC has it active on GVR's processor license (CCL21-0000679) since manifest 0011624151 (Oct 3, OHR > GVR).
-- The app had it in OHR R2X (moved there Oct 29). Aziz: put it at GVR in the app. It lands in GVR Staging (needs a spot).
-- Run live by Claude 11/4. Safe to re-run.
begin;
update pallets
   set slot_id = null, status = 'unslotted', received_site = 'GVR'
 where code = 'P81' and status in ('in_freezer', 'unslotted') and coalesce(pallet_site(pallets), '') <> 'GVR';
insert into events (user_email, type, pallet_id, lbs, note, details)
select 'claude (for aziz@lifted-organics.com)', 'note', p.id, p.current_weight,
       'Back to GVR in the app: METRC has it active on GVR''s license (CCL21-0000679) since manifest 0011624151 (Oct 3). Was in OHR R2X in the app. Msg R-211.',
       jsonb_build_object('sql', '205')
  from pallets p where p.code = 'P81' and not exists (select 1 from events e where e.pallet_id = p.id and e.details ->> 'sql' = '205');
commit;
select code, status, pallet_site(p) site, slot_id, received_site, metrc_pkg_license(package_tag) metrc_license from pallets p where code = 'P81';
