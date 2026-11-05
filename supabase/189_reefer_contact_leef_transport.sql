-- 189_reefer_contact_leef_transport.sql
-- Follow-up to 188 with Aziz's answers:
--  * Reefer Trucking contact is Randy, 831-247-6740
--  * Bryan Wilks' license is A3481575 (the older manifests were right)
--  * Paynes Distribution trucks are LEEF picking up their own orders
-- Safe to re-run.

begin;

update fleet_carriers
   set contact_name = 'Randy', phone = '831-247-6740', updated_at = now()
 where name ilike 'Reefer Trucking%';

update fleet_drivers
   set license_no = 'A3481575',
       notes = 'Reefer Trucking driver, from METRC manifests. License confirmed by Aziz.',
       updated_at = now()
 where name = 'Bryan Wilks';

update customers
   set can_transport = true,
       notes = trim(both E'\n' from coalesce(notes, '') || E'\n' ||
               'Picks up with Paynes Distribution, LLC trucks (C11-0000916-LIC).'),
       updated_at = now()
 where name = 'LEEF Labs'
   and coalesce(notes, '') not ilike '%Paynes%';

commit;
