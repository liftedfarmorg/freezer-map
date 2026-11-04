-- 167: Froot By The Foot = Froot By The Foot Auto (Aziz 11/4, Msg BIO-3). App only, nothing to METRC or QuickBooks.
-- Adds "Froot By The Foot" as another name for Froot By The Foot Auto and fixes the LEEF Dry Biomass history line (SO-26072807, 3,200 lb)
-- that came in from QuickBooks as "FrootbytheFoot". Run live by Claude. Safe to re-run.
begin;
update strains set aliases = array_append(aliases, 'Froot By The Foot') where name = 'Froot By The Foot Auto' and not ('Froot By The Foot' = any(aliases));
update order_lines set strain = 'Froot By The Foot Auto', updated_at = now() where strain = 'FrootbytheFoot';
update invoice_lines set strain = 'Froot By The Foot Auto' where strain = 'FrootbytheFoot';
commit;
