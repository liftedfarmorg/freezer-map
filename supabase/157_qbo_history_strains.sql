-- 157: clean up strain names on the QuickBooks history order lines from 154 (Msg FULFILL-QBO-6, 11/1/2026). App only.
-- QuickBooks descriptions like "Cereal Milk Standards - OHR", "FL24-GV-OCAL-FF- CheetahPiss", "SU25-MF-FF-GrapeGas" or codes with
-- invisible word-joiner characters came in as the strain. This maps them to the app's strain names (name or alias, ignoring case,
-- spaces and punctuation); when there's no match the cleaned name is kept (e.g. "Mod Mintz"). Invoice lines tied to them follow.
-- Run live by Claude 11/1 right after 154. Safe to re-run.
begin;
create temp table fix_strain on commit drop as
with l as (
  select ol.id, ol.strain old, replace(ol.strain, chr(8288), '') s0
    from order_lines ol join orders o on o.id = ol.order_id
   where o.source = 'qbo' and not exists (select 1 from strains s where s.name = ol.strain)),
c as (select id, old, case
        when s0 ~ ' (Standards|Smalls) - ' then trim(substring(s0 from '^(.*?) (?:Standards|Smalls) - '))
        when s0 ~ '^(FL|SU)\d\d-' then trim(regexp_replace(regexp_replace(s0, '-LEEF$', ''), '^.*-', ''))
        else s0 end cand from l)
select c.id, c.old, coalesce((select s.name from strains s
          where regexp_replace(lower(s.name), '[^a-z0-9]', '', 'g') = regexp_replace(lower(c.cand), '[^a-z0-9]', '', 'g')
             or exists (select 1 from unnest(coalesce(s.aliases, '{}'::text[])) a
                         where regexp_replace(lower(a), '[^a-z0-9]', '', 'g') = regexp_replace(lower(c.cand), '[^a-z0-9]', '', 'g'))
          order by s.active desc nulls last limit 1), c.cand) as new
  from c;
update order_lines ol set strain = f.new, updated_at = now() from fix_strain f where f.id = ol.id and f.new <> ol.strain;
update invoice_lines il set strain = f.new from fix_strain f where il.order_line_id = f.id and il.strain is distinct from f.new;
select count(*) as fixed from fix_strain where new <> old;
commit;
