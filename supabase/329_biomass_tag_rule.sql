-- 329_biomass_tag_rule.sql  (Msg BIO-TAG-2, 2026-11-10)
-- Aziz: Dry Biomass (combine) pallets at OHR get their own pallet range and tag range, like trials (T):
--   B001 -> ABC06030007AD3D000001801 ... B200 -> ABC06030007AD3D000002000  (prefix ABC06030007AD3D, offset 1800, 9 digits)
-- * Tag rule OHR B: the tag fills in from the pallet number (blank tag box = rule tag).
-- * Reserved harvest block 1801-2000 on CCL25-0000017: the Harvest screen offers these tags, and they are no longer
--   suggested for splits, combines or new packages.
-- * B numbers get 3 digits (B001), like T. No B pallets exist yet (checked live 11/10), so nothing is renamed.
-- * New block each year: after the 2026 crop, shrink the range to what was used and add next year's block.
-- OHR only. Patches cult_next_pallet and cult_add_pallets by text (stops if the text isn't what it expects). Re-runnable.
begin;

insert into tag_rules (site, letter, prefix, "offset", digits, license, active, notes, updated_by, updated_at)
values ('OHR', 'B', 'ABC06030007AD3D', 1800, 9, 'CCL25-0000017', true,
        'Dry Biomass pallets 2026: B001 = ABC...1801, B200 = ABC...2000 (329, Msg BIO-TAG-2)', 'aziz@lifted-organics.com', now())
on conflict (site, letter) do update set prefix = excluded.prefix, "offset" = excluded."offset", digits = excluded.digits,
       license = excluded.license, active = true, notes = excluded.notes, updated_by = excluded.updated_by, updated_at = now();

insert into tag_ranges (site, purpose, prefix, first_n, last_n, digits, active, notes, license, reserved)
select 'OHR', 'harvest', 'ABC06030007AD3D', 1801, 2000, 9, true, 'Dry Biomass pallet tags 2026, B001-B200 (tag rule, 329)', 'CCL25-0000017', true
 where not exists (select 1 from tag_ranges where reserved and license = 'CCL25-0000017' and purpose = 'harvest'
                     and prefix = 'ABC06030007AD3D' and first_n = 1801);

-- 3-digit B numbers, like T
do $$
declare d text; f text;
begin
  foreach f in array array['cult_next_pallet(bigint, integer)', 'cult_add_pallets(bigint, jsonb)'] loop
    d := pg_get_functiondef(f::regprocedure);
    if position('case when pre in (''T'', ''B'') then lpad(' in d) = 0 then
      if position('case when pre = ''T'' then lpad(' in d) = 0 then
        raise exception '329: % is not what 329 expects; nothing changed', f;
      end if;
      d := replace(d, 'case when pre = ''T'' then lpad(', 'case when pre in (''T'', ''B'') then lpad(');
      execute d;
    end if;
  end loop;
end $$;

insert into events (user_email, type, note, details)
values ('aziz@lifted-organics.com', 'tag_rule', 'OHR B (329)',
        jsonb_build_object('site', 'OHR', 'letter', 'B', 'prefix', 'ABC06030007AD3D', 'offset', 1800, 'block', '1801-2000'));

commit;

-- check
select tag_for_code('OHR', 'B001') as b001, tag_for_code('OHR', 'B200') as b200;

-- Undo:
-- delete from tag_rules where site = 'OHR' and letter = 'B';
-- delete from tag_ranges where reserved and license = 'CCL25-0000017' and prefix = 'ABC06030007AD3D' and first_n = 1801;
-- (3-digit padding: replace "case when pre in ('T', 'B') then lpad(" back to "case when pre = 'T' then lpad(" in both functions)
