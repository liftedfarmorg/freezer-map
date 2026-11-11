-- 336_nursery_g2_packages_from_metrc.sql (Msg NUR-8, 11/11)
-- 1PN G2 cutting batches (Nursery > Batches, cut 10/11) get their real METRC clone package from Tiffani's 10/13 packages.
-- App only: nothing is sent to METRC (a cut count going up from 36 doesn't queue a METRC to-do; only 0 -> n does).
-- Matched by strain name (letters and numbers only), only where exactly one app batch and exactly one METRC package share the name.
-- Sets: package_tag = METRC tag, cuttings = METRC count (+ lost, so "left" = METRC count), tags = {} (they were package tags on the wrong strains).
-- Old values kept in nursery_batches_bak_336 (undo at the bottom). Also: nursery METRC actions to Auto.
-- Re-runnable.

create table if not exists nursery_batches_bak_336 as
  select id, strain, cuttings, lost, tags, package_tag, now() as saved_at from nursery_batches where false;

with app as (
  select b.id, regexp_replace(lower(b.strain), '[^a-z0-9]', '', 'g') as k
    from nursery_batches b
   where b.site = '1PN' and b.gen = 2 and b.cut_on = '2026-10-11' and b.stage not in ('done', 'cancelled')
),
pk as (
  select p.label, p.qty,
         regexp_replace(lower(regexp_replace(p.item, '^1PN - (.*) - Clone$', '\1')), '[^a-z0-9]', '', 'g') as k
    from metrc_packages p
   where p.license = 'CCL24-0000156' and p.state = 'active' and p.item ~ ' - Clone$' and p.packaged_on = '2026-10-13'
),
one_app as (select k from app group by k having count(*) = 1),
one_pk  as (select k from pk  group by k having count(*) = 1),
pairs as (
  select a.id, p.label, p.qty
    from app a join pk p on p.k = a.k
   where a.k in (select k from one_app) and a.k in (select k from one_pk)
),
saved as (
  insert into nursery_batches_bak_336 (id, strain, cuttings, lost, tags, package_tag, saved_at)
  select b.id, b.strain, b.cuttings, b.lost, b.tags, b.package_tag, now()
    from nursery_batches b join pairs x on x.id = b.id
   where not exists (select 1 from nursery_batches_bak_336 z where z.id = b.id)
  returning id
)
update nursery_batches b
   set package_tag = upper(x.label),
       cuttings    = round(x.qty)::int + coalesce(b.lost, 0),
       tags        = '{}',
       notes       = trim(both ' ' from regexp_replace(coalesce(b.notes, ''), '\s*\(cut count not entered yet: 36 standard cuts assumed\)', ''))
                     || ' [336: package + count from METRC 10/13]',
       updated_at  = now()
  from pairs x
 where b.id = x.id
   and (b.package_tag is distinct from upper(x.label) or b.cuttings <> round(x.qty)::int + coalesce(b.lost, 0) or cardinality(b.tags) > 0);

-- nursery METRC actions on Auto (Aziz 11/11). Stops here if old nursery to-dos are waiting (they'd send on Auto).
do $$ begin
  if exists (select 1 from comp_metrc_actions where kind like 'nursery%' and status in ('todo', 'error')) then
    raise exception 'Open nursery METRC to-dos exist: look at them before switching to Auto';
  end if;
end $$;
update metrc_push_kinds set mode = 'auto', updated_by = 'sql 336', updated_at = now()
 where kind in ('nursery_clones', 'nursery_mothers', 'nursery_loss') and mode <> 'auto';

-- check
select (select count(*) from nursery_batches where site = '1PN' and gen = 2 and package_tag is not null) as g2_with_package,
       (select count(*) from nursery_batches_bak_336) as saved_for_undo,
       (select sum(cuttings - coalesce(lost, 0)) from nursery_batches where site = '1PN' and gen = 2 and package_tag is not null) as plants_on_matched,
       (select string_agg(kind || '=' || mode, ', ') from metrc_push_kinds where kind like 'nursery%') as nursery_modes,
       (select count(*) from comp_metrc_actions where kind like 'nursery%' and status in ('todo', 'error')) as open_nursery_todos;

-- UNDO (only if needed):
-- update nursery_batches b set cuttings = z.cuttings, lost = z.lost, tags = z.tags, package_tag = z.package_tag from nursery_batches_bak_336 z where z.id = b.id;
