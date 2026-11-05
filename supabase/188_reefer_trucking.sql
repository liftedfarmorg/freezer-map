-- 188_reefer_trucking.sql
-- Adds Reefer Trucking, LLC as an outside carrier, plus the trucks and drivers
-- they used on Lifted's METRC manifests (scanned 539 manifests since Aug 2025,
-- 26 were hauled by Reefer Trucking, METRC transporter facility 52903).
-- Safe to re-run: skips anything already there.

begin;

insert into fleet_carriers (name, license_no, notes, active, created_by)
select 'Reefer Trucking', 'C13-0000140-LIC',
       'Reefer Trucking, LLC. Outside carrier. Found on 26 METRC manifests (Jan to Sep 2026).',
       true, 'migration 188'
where not exists (select 1 from fleet_carriers where name ilike 'Reefer Trucking%');

-- vehicles is a view over fleet_assets, so the trucks go into fleet_assets.
with c as (select id from fleet_carriers where name ilike 'Reefer Trucking%' order by id limit 1),
v(name, make, model, plate, spaces, notes) as (values
  ('Reefer Trucking Freightliner M2 106 (52539T3)', 'Freightliner', 'M2 106', '52539T3', 12, 'Most used, 15 manifests, last 2026-09-08. Size not on METRC: spaces are a guess for a 26'' reefer box.'),
  ('Reefer Trucking Freightliner M2 106 (17933B4)', 'Freightliner', 'M2 106', '17933B4', 12, '4 manifests, last 2026-05-08. Spaces are a guess.'),
  ('Reefer Trucking International 4300 (7VD4HL)',   'International', '4300', '7VD4HL',  12, '2 manifests, last 2026-02-18. Spaces are a guess.'),
  ('Reefer Trucking Isuzu NRR (1365A3)',            'Isuzu', 'NRR', '1365A3',   8, '1 manifest, 2026-07-31. Spaces are a guess.'),
  ('Reefer Trucking Freightliner box truck (85032U3)', 'Freightliner', 'Box truck', '85032U3', 12, '1 manifest, 2026-07-22. Spaces are a guess.')
)
insert into fleet_assets (kind, name, make, model, plate, status, department, body_type,
                          pallet_spaces, pallets_across, carrier_id, ship_class, notes)
select 'vehicle', v.name, v.make, v.model, v.plate, 'active', 'company', 'Reefer truck',
       v.spaces, 2, c.id, (select ship_class from fleet_assets where id = 3), v.notes
from v, c
where not exists (select 1 from fleet_assets x where x.plate = v.plate);

with c as (select id from fleet_carriers where name ilike 'Reefer Trucking%' order by id limit 1),
d(name, license_no, notes) as (values
  ('Kris Dinoto',  'A8815560', 'Reefer Trucking driver, from METRC manifests.'),
  ('Bryan Wilks',  'A348575',  'Reefer Trucking driver. Older manifests show A3481575, check his card.'),
  ('Dylan Krone',  'D3509014', 'Reefer Trucking driver, from METRC manifests.')
)
insert into fleet_drivers (name, license_no, department, carrier_id, active, notes)
select d.name, d.license_no, 'company', c.id, true, d.notes
from d, c
where not exists (select 1 from fleet_drivers x where lower(x.name) = lower(d.name));

commit;
