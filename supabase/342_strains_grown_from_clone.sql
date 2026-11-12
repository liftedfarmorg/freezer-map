-- Migration 342 (Msg STRAIN-INV-5, Aziz 11/11): the rest of the active strains with no "Grown from" are clones from outside nurseries.
-- Left alone on purpose: Alien OG Auto, Froot By The Foot Auto, Froze Auto, Gas Face Auto, GMO Auto, Tropicanna Cherry S1, MBxBP (Aziz: don't touch),
-- and the old spreadsheet rows (Subtotal ..., Total, Total / Average), which Aziz is cleaning up himself. Retired strains aren't touched.
-- App only, nothing to METRC. The strains this changes are listed in strains_bak_342. Run after 341.
set client_min_messages = warning;

create table if not exists strains_bak_342 as
  select id, name, grown_from from strains
   where grown_from is null and active
     and name not in ('Alien OG Auto', 'Froot By The Foot Auto', 'Froze Auto', 'Gas Face Auto', 'GMO Auto', 'Tropicanna Cherry S1', 'MBxBP', 'Total', 'Total / Average')
     and name not ilike 'Subtotal %';
alter table strains_bak_342 enable row level security;

update strains set grown_from = 'clone'
 where grown_from is null and active
   and name not in ('Alien OG Auto', 'Froot By The Foot Auto', 'Froze Auto', 'Gas Face Auto', 'GMO Auto', 'Tropicanna Cherry S1', 'MBxBP', 'Total', 'Total / Average')
   and name not ilike 'Subtotal %';

select 'grown from filled' as done,
  (select count(*) from strains where active and grown_from = 'seed') as seed, (select count(*) from strains where active and grown_from = 'clone') as clone,
  (select string_agg(name, ' | ' order by name) from strains where active and grown_from is null) as still_blank;
-- undo: update strains set grown_from = null where id in (select id from strains_bak_342);
