-- 185: T034 harvest done by hand in METRC by Aziz (Msg SPLIT-7, 11/4). App only.
-- The API was refused (METRC 400 "Something went wrong"); Aziz harvested 99 Slapz plants (not 66) at 298.36 lb into
-- OHR-B028-7-11042026-3-FF in METRC. App harvest 171 and to-do #799 follow: 99 plants. #799 then found the harvest in METRC and
-- marked itself sent; #800 (T034 ...834 179.04), #801 (T025 ...825 65.02) and #804 (T034-1 40 lb split for Bear Labs) sent OK.
-- #802 waste 54.3 and #803 finish go on their own. Run live by Claude 11/4.
begin;
update cult_harvests set plants_harvested = 99, metrc_plants = 99, updated_at = now() where id = 171;
update comp_metrc_actions set details = details || jsonb_build_object('plants', 99, 'note', 'Harvested by hand in METRC by Aziz 11/4: 99 Slapz plants, 298.36 lb (the API was refused)'),
       summary = replace(summary, '66 Slapz plants', '99 Slapz plants (done by hand in METRC)'),
       push_state = null, push_attempts = 0, push_error = null
 where id = 799 and status = 'todo';
update comp_metrc_actions set push_state = null, push_error = null where id in (800, 801, 804) and push_state = 'waiting';
commit;
