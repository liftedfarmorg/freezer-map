-- 206: M4 (mixed pallet, Frozen California SO-26102203) to GVR Staging in the app (Msg R-213, 11/4). App only, nothing to METRC.
-- Its two packages, P287-2 (Sea Foam, 100 lb) and T003-1 (Garlic Grapes x Pack Mule #26, 130 lb), have been active on GVR's
-- processor license (CCL21-0000679) since manifest 0011764544 (Oct 26, OHR > GVR). The app had M4 in OHR 42H.
-- Aziz: Frozen California never picked up the order; put M4 in GVR Staging. It stays held for SO-26102203.
-- Run live by Claude 11/4. Safe to re-run.
begin;
update pallets
   set slot_id = null, status = 'unslotted', received_site = 'GVR',
       notes = concat_ws(E'\n', nullif(notes, ''), '11/4: to GVR Staging in the app. METRC has its packages on GVR''s license (CCL21-0000679) since manifest 0011764544 (Oct 26). Was in OHR 42H in the app (SQL 206).')
 where code = 'M4' and status in ('in_freezer', 'unslotted') and coalesce(pallet_site(pallets), '') <> 'GVR';
commit;
select p.code, p.status, pallet_site(p) site, p.slot_id,
       (select string_agg(c.code || ' ' || coalesce(pallet_site(c), '?'), ', ') from pallets c where c.container_id = p.id) packages
  from pallets p where p.code = 'M4';
