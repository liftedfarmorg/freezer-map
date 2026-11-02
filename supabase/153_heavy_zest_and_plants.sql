-- 153_heavy_zest_and_plants.sql  (Msg HARV-TIE-3, 2026-11-01; run live by Claude after Aziz's go)
-- App only, nothing to METRC.
--
-- A. Heavy Zest (METRC strain Fatso x Nam Wah #27). Aziz confirmed 11/1.
--    METRC harvest OHR-0102-Frozen-102026: 1,343 plants, 5,441.97 lb wet, 4,211.36 packaged (P737-P743).
--    Farm Data OHR 2026: Harvest METRC tab 10/20 Block 1, raw 5,442.8; Frozen Harvest tab P737-P743 Heavy Zest Block 1-C,
--    4,211.36; Clone Planting 1,343 plants Block 1-C.
--    App had two rows: 73 (raw 5,442.8, no pallets, plants wrong: 641 / 5,443) and 176 (the 7 pallets, no raw).
--    -> one harvest 73 named Heavy Zest with the pallets, 1,343 plants, planting 52, METRC name OHR-0102-Frozen-102026; 176 cancelled.
-- B. 10/21 harvests showing 0 plants: plants harvested = the planting's plants (all plants in that block,
--    "All" on the Harvest METRC tab; matches METRC where it can be checked: Sour Strawberry 2,269, Plantain Pressure 1,478).
begin;

-- A
update pallets set harvest_id = 73, updated_at = now() where harvest_id = 176;
update cult_harvests set strain = 'Heavy Zest', plants = 1343, plants_harvested = 1343, metrc_plants = 1343,
       planting_id = 52, ff_lbs = null, metrc_name = 'OHR-0102-Frozen-102026',
       notes = concat_ws(' ', notes, '| 11/1 (153): Heavy Zest = METRC strain Fatso x Nam Wah #27; pallets P737-P743 moved here from 176.'),
       updated_at = now()
 where id = 73;
update cult_harvests set status = 'cancelled', stage = null,
       notes = concat_ws(' ', notes, '| Cancelled 11/1 (153): duplicate of harvest 73, pallets are on that one.'), updated_at = now()
 where id = 176 and not exists (select 1 from pallets p where p.harvest_id = 176);

-- B
update cult_harvests h set plants_harvested = pl.plants, updated_at = now()
  from cult_plantings pl
 where pl.id = h.planting_id and h.id in (90, 92, 130, 66, 107, 115) and coalesce(h.plants_harvested, 0) = 0;

insert into events (user_email, type, note, details)
values ('aziz@lifted-organics.com', 'harvest_fix', '153 Heavy Zest harvest merged (73 kept, 176 cancelled); 10/21 plants filled',
        jsonb_build_object('msg', 'HARV-TIE-3'));
commit;

select h.id, h.strain, h.status, h.plants_harvested, h.metrc_name,
       (select count(*) from pallets p where p.harvest_id = h.id and p.parent_id is null) as pallets,
       (select sum(og_weight) from pallets p where p.harvest_id = h.id and p.parent_id is null) as pallet_lbs
  from cult_harvests h where h.id in (73, 176, 90, 92, 130, 66, 107, 115) order by h.id;
