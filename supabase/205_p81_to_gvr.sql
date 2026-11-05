-- 205: P81 (Papaya Bomb, 11.28 lb) back to GVR in the app (Msg R-211, 11/4). App only, nothing to METRC.
-- METRC has it active on GVR's processor license (CCL21-0000679) since manifest 0011624151 (Oct 3, OHR > GVR).
-- The app had it in OHR R2X (moved there Oct 29). Aziz: put it at GVR in the app. It lands in GVR Staging (needs a spot);
-- the staging trigger logs the usual "staged" event. A note goes on the pallet.
-- Run live by Claude 11/4. Safe to re-run.
begin;
update pallets
   set slot_id = null, status = 'unslotted', received_site = 'GVR',
       notes = concat_ws(E'\n', nullif(notes, ''), '11/4: back to GVR in the app. METRC has it active on GVR''s license (CCL21-0000679) since manifest 0011624151 (Oct 3). Was in OHR R2X in the app (SQL 205).')
 where code = 'P81' and status in ('in_freezer', 'unslotted') and coalesce(pallet_site(pallets), '') <> 'GVR';
commit;
select code, status, pallet_site(p) site, slot_id, received_site, metrc_pkg_license(package_tag) metrc_license from pallets p where code = 'P81';
