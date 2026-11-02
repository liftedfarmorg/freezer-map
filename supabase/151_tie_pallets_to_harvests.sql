-- 151_tie_pallets_to_harvests.sql  (Msg HARV-TIE-1, 2026-11-01; run live by Claude 11/1 after Aziz's go, Msg HARV-TIE-2)
-- Ties fresh frozen pallets (in the freezers and the ones that already left) to their harvests on
-- Production > Schedule > Harvested. App only: nothing goes to METRC (every pallet here is already pushed).
--
-- 1. Pallets with no harvest:
--      T001 Strawberry Chocolate #30 (+ T001-1 shipped)            -> 88
--      T002 SBC26 x Permanent Marker #31                            -> 136
--      T003 Garlic Grapes x Pack Mule #26 (+ T003-1)                -> 137
--      T004 Canal St Runtz x Oreoz #41                              -> 138
--      P756-P762 (+ P762-1 shipped) "Government Oasis" 4,550 lb     -> 90 Governmint Oasis Block 2 (ff 4,550)
--      P763 "Government Oasis" 597.58 lb                            -> 92 Governmint Oasis Block 7 (ff 597.58)
--        (strain fixed to Governmint Oasis, matches the Farm Data sheet)
--      P809, P810 Diablo Haze                                       -> 120
--      P811-P814 Plantain Pressure                                  -> 130
-- 2. Pallets sitting on a duplicate "Not on the harvest schedule (from N freezer pallets)" row, moved to the real harvest
--    (same strain, same day, pallet total = that harvest's fresh frozen lbs), then the duplicate is cancelled:
--      179 "Madd Fruit" (P805, P806 are Diablo Haze)  -> 120 Diablo Haze      (P805-P810 = 3,772.4 = harvest 120)
--      183 Plantain Pressure (P815)                   -> 130                  (P811-P815 = 2,799.54)
--      184 Pressure (P781-P793)                       -> 66 Pressure Block 7  (8,482.84)
--      185 Rainbow Guava (17 pallets)                 -> 107 Rainbow Guava Block 7 (11,053.54)
--      188 Sour Strawberry (P794-P801, P799-1)        -> 115 Sour Strawberry Block 7
-- 3. Duplicate rows with no pallets, already covered by the harvest that was pushed to METRC (cancelled, not deleted):
--      118 + 193 Banana Split (210 has all 12 pallets, METRC OHR-0079-Frozen-102126)
--      125 + 170 Banana Squeeze (212), 117 Coup D'etat (211), 71 Garlic Cocktail (213),
--      83 + 191 Super Lemon Haze (214), 85 Violet Torque (216)
-- 4. Trial pallets with a planting but no harvest row: new finished harvests for
--      T032 GMO x Mule Fuel #21, T037 Black Truffle x Pack Mule #37, T047 Toad Venom (all 10/19, Block 3)
-- 5. Split pallets that left (shipped / merged / on a mixed pallet) get their parent's harvest, so what left is tied too.
-- 6. Harvests showing 0 lb fresh frozen while they have pallets: the 0 is cleared so the tab shows the pallets' total.
--
-- Not touched (see the questions in the reply): combo pallets C1, C2, C4, C5, P253-2; GVR inbound copies G7991-G7999,
-- G7117, G7119; Molten Grapes 161 vs 180; Fatso x Nam Wah #27 (73); Enigma P830-P832, P842; dry lots (already tied by from_harvest).

begin;

-- 1. strain spelling, then pallets with no harvest
update pallets set strain = 'Governmint Oasis', updated_at = now()
 where strain = 'Government Oasis' and code in ('P756','P757','P758','P759','P760','P761','P762','P762-1','P763');

update pallets p set harvest_id = x.hid, updated_at = now()
  from (values ('T001', 88), ('T002', 136), ('T003', 137), ('T004', 138),
               ('P756', 90), ('P757', 90), ('P758', 90), ('P759', 90), ('P760', 90), ('P761', 90), ('P762', 90),
               ('P763', 92),
               ('P809', 120), ('P810', 120),
               ('P811', 130), ('P812', 130), ('P813', 130), ('P814', 130)) as x(code, hid)
 where p.code = x.code and p.harvest_id is null;

-- 2. duplicate rows that hold the pallets -> the real harvest
update pallets p set harvest_id = x.to_h, updated_at = now()
  from (values (179, 120), (183, 130), (184, 66), (185, 107), (188, 115)) as x(from_h, to_h)
 where p.harvest_id = x.from_h;

-- 2 + 3. cancel duplicates (only if nothing is left on them)
update cult_harvests h set status = 'cancelled', stage = null,
       notes = concat_ws(' ', h.notes, '| Cancelled 11/1 (151): duplicate of harvest ' || x.keep || ', pallets are on that one.'),
       updated_by = 'aziz@lifted-organics.com', updated_at = now()
  from (values (179, 120), (183, 130), (184, 66), (185, 107), (188, 115),
               (118, 210), (193, 210), (125, 212), (170, 212), (117, 211), (71, 213),
               (83, 214), (191, 214), (85, 216)) as x(id, keep)
 where h.id = x.id and h.status = 'done'
   and not exists (select 1 from pallets p where p.harvest_id = h.id);

-- 4. trial harvests (from the planting) for T032 / T037 / T047
with t as (
  select p.code, p.harvest_date, pl.id as planting_id, pl.site, pl.field_id, pl.strain, pl.plants, pl.crop_year
    from pallets p
    join cult_plantings pl on pl.crop_year = 2026 and lower(pl.strain) = lower(p.strain)
   where p.code in ('T032','T037','T047') and p.harvest_id is null
), ins as (
  insert into cult_harvests (crop_year, site, field_id, strain, planting_id, kind, status, planned_on, harvested_on, plants, notes, created_by)
  select crop_year, site, field_id, strain, planting_id, 'ff', 'done', harvest_date, harvest_date, plants,
         'Not on the harvest schedule (from 1 freezer pallet, ' || code || '); added 11/1 (151)', 'aziz@lifted-organics.com'
    from t
  returning id, strain
)
update pallets p set harvest_id = ins.id, updated_at = now()
  from ins where p.code in ('T032','T037','T047') and lower(p.strain) = lower(ins.strain) and p.harvest_id is null;

-- 5. split pallets inherit their top pallet's harvest (fresh frozen only)
with recursive tree as (
  select id, harvest_id as root_h from pallets where parent_id is null and harvest_id is not null
  union all
  select c.id, t.root_h from pallets c join tree t on c.parent_id = t.id
)
update pallets p set harvest_id = t.root_h, updated_at = now()
  from tree t where p.id = t.id and p.harvest_id is null and p.parent_id is not null;

-- 6. 0 lb fresh frozen on harvests that have pallets: let the pallets' total show
update cult_harvests h set ff_lbs = null, updated_at = now()
 where h.crop_year = 2026 and h.kind = 'ff' and h.status = 'done' and h.ff_lbs = 0
   and exists (select 1 from pallets p where p.harvest_id = h.id and p.parent_id is null);

insert into events (user_email, type, note, details)
values ('aziz@lifted-organics.com', 'harvest_fix', '151 pallets tied to harvests, duplicates cancelled, trial harvests added',
        jsonb_build_object('msg', 'HARV-TIE-1'));

commit;

-- check: what's still in the freezers (or left) with no harvest, 2026 fresh frozen
select p.code, p.strain, p.status, p.og_weight, p.current_weight
  from pallets p
 where p.harvest_id is null and p.from_harvest is null and p.crop_year = 2026 and p.product = 'fresh_frozen'
   and p.status not in ('archived')
 order by p.strain, p.code;
