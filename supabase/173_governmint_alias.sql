-- 173 (RUN LIVE 11/3 by Claude, Aziz OK): "Government Oasis" is Governmint Oasis (the correct name). Add it as another name
-- so packages and METRC names written "Government Oasis" match the strain. Safe to re-run.
update strains set aliases = array_append(coalesce(aliases, '{}'), 'Government Oasis'), updated_at = now()
 where name = 'Governmint Oasis' and not ('Government Oasis' = any(coalesce(aliases, '{}')));
insert into events (user_email, type, note, details) values ('SQL 173', 'strain_alias', 'Governmint Oasis', '{"alias":"Government Oasis"}');
