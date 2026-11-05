-- 190_profarms_deeper_dive_transport.sql
-- Aziz's answers:
--  * Westside Caregivers is Deeper Dive's transporter (they pick up their own loads)
--  * Add ProFarms as a customer. Merced Distribution picks up for them.
--    Merced hauled our manifests to Merced Distribution LLC, license CCL21-0004596.
-- Safe to re-run.

begin;

update customers
   set can_transport = true,
       notes = trim(both E'\n' from coalesce(notes, '') || E'\n' ||
               'Picks up with Westside Caregivers Club, Inc. trucks (C12-0000266-LIC).'),
       updated_at = now()
 where name = 'Deeper Dive'
   and coalesce(notes, '') not ilike '%Westside%';

insert into customers (name, kind, license, active, can_transport, notes)
select 'ProFarms', 'external', 'CCL21-0004596', true, true,
       'Licensee in METRC: Merced Distribution LLC. Picks up with Merced Distribution LLC trucks (C11-0001612-LIC). Added from METRC manifests, fill in billing details.'
where not exists (select 1 from customers where name ilike 'ProFarms' or license = 'CCL21-0004596');

commit;
