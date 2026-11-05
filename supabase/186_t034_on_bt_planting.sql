-- 186: BT x PM #6 harvest 171 back on its own planting (Aziz 11/4, Msg SPLIT-8). App only.
-- Aziz: mark the Block 3 BT x PM #6 planting as harvested with this weight. Harvest 171 moves back to planting 118 (Block 3):
-- 64 plants (66 planted, 2 lost), 244.06 lb packaged (T034 + T025), 54.3 waste. The METRC side stays as it is:
-- OHR-B028-7-11042026-3-FF from 99 Slapz plants in Field 7 (metrc_plants 99). Run live by Claude 11/4.
begin;
update cult_harvests set planting_id = 118, field_id = 6, planted_strain = null, plants_harvested = 64,
       notes = concat_ws(E'\n', notes, 'App: the 64 Black Truffle x Pack Mule #6 plants in Block 3 (66 planted, 2 lost), 244.06 lb packaged (T034 + T025), 54.3 waste. METRC: OHR-B028-7-11042026-3-FF from 99 Slapz plants in Field 7 (Aziz, by hand 11/4), since BT x PM #6 was never in METRC.'),
       updated_at = now()
 where id = 171;
commit;
