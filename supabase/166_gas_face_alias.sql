-- 166 (first saved as 159, which another session already used): Gas Face = Gas Face Auto (Aziz 11/3, Msg BIO-2). App only, nothing to METRC or QuickBooks.
-- Adds "Gas Face" as another name for Gas Face Auto and fixes the 3 LEEF Dry Biomass history lines (SO-26080505, SO-26090101, SO-26101310)
-- that came in from QuickBooks as "GasFace". Run live by Claude 11/3. Safe to re-run.
begin;
update strains set aliases = array_append(aliases, 'Gas Face') where name = 'Gas Face Auto' and not ('Gas Face' = any(aliases));
update order_lines set strain = 'Gas Face Auto', updated_at = now() where strain = 'GasFace';
update invoice_lines set strain = 'Gas Face Auto' where strain = 'GasFace';
commit;
