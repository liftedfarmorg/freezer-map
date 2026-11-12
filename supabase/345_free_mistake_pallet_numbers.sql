-- 345_free_mistake_pallet_numbers.sql  (Msg BACKOUT-1, 2026-11-12)
-- Aziz: backed out of the Napa combine harvest (#102) and can't re-add B012.
-- Why: removing a pallet "logged by mistake" archives it but keeps its pallet # (B012...B021), and pallet #s are
-- unique, so "Pallet B012 already exists" and the next number jumps to B022.
-- Fix:
--   1. cult_remove_pallet: a pallet removed as logged by mistake (never pushed) gives its number back:
--      code becomes B012-X2235 (row id), the tag is cleared, and the note keeps what it was.
--   2. Frees the numbers of the pallets already removed that way (never pushed, nothing else done to them).
--      Live 11/12: B012, B014-B021 on harvest 102. After this the next B number is B012 again.
-- Patches cult_remove_pallet by text (stops if the text isn't what it expects). Re-runnable.
begin;

do $$
declare d text;
begin
  d := pg_get_functiondef('cult_remove_pallet(bigint)'::regprocedure);
  if position('was '' || p.code' in d) = 0 then
    if position('notes = concat_ws('' '', notes, ''(logged by mistake)''), updated_at = now() where id = p.id;' in d) = 0 then
      raise exception '345: cult_remove_pallet is not what 345 expects; nothing changed';
    end if;
    d := replace(d,
      'notes = concat_ws('' '', notes, ''(logged by mistake)''), updated_at = now() where id = p.id;',
      'code = p.code || ''-X'' || p.id, package_tag = null,
         notes = concat_ws('' '', notes, ''(logged by mistake; was '' || p.code || coalesce('', tag '' || p.package_tag, '''') || '')''),
         updated_at = now() where id = p.id;   -- 345: gives the pallet # and tag back');
    execute d;
  end if;
end $$;

-- the ones already removed by mistake: show, then free
select id, code, harvest_id, package_tag, og_weight from pallets p
 where p.status = 'archived' and not coalesce(p.pushed, false) and p.harvest_id is not null
   and p.notes like '%(logged by mistake)%' and p.code !~ '-X[0-9]+$'
   and not exists (select 1 from events e where e.pallet_id = p.id and e.type not in ('harvested', 'harvest_fix', 'move', 'harvest_undone'))
 order by code;

with freed as (
  update pallets p set code = p.code || '-X' || p.id, package_tag = null,
         notes = replace(p.notes, '(logged by mistake)', '(logged by mistake; was ' || p.code || coalesce(', tag ' || p.package_tag, '') || ')'),
         updated_at = now()
   where p.status = 'archived' and not coalesce(p.pushed, false) and p.harvest_id is not null
     and p.notes like '%(logged by mistake)%' and p.code !~ '-X[0-9]+$'
     and not exists (select 1 from events e where e.pallet_id = p.id and e.type not in ('harvested', 'harvest_fix', 'move', 'harvest_undone'))
  returning p.id, p.code, p.harvest_id
)
insert into events (user_email, type, pallet_id, note, details)
select 'aziz@lifted-organics.com', 'pallet_number_freed', id, 'Logged by mistake: pallet # given back (345)',
       jsonb_build_object('new_code', code, 'harvest_id', harvest_id)
  from freed;

commit;

-- check: B012 should be the next Dry Biomass number on the Napa combine harvest
select 'B' || lpad((coalesce(max(substring(code from 2)::int), 0) + 1)::text, 3, '0') as next_b_number from pallets where code ~ '^B[0-9]+$';
select code, status, notes from pallets where code like 'B0%' order by code;

-- Undo (only for pallets not re-used since): update pallets set code = split_part(code, '-X', 1) where code ~ '^B[0-9]+-X[0-9]+$' and status = 'archived';
-- (and replace "code = p.code || '-X' || p.id, package_tag = null," in cult_remove_pallet with nothing)
