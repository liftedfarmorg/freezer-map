-- 233: Merge / combine of pieces that never got a tag (Msg COMBINE-1..3, Aziz 11/6).
-- The floor split pieces off pallets for an order with the tag PENDING, then merged the pieces into one C pallet
-- (C8-C11 on 11/6). The combine to-do listed the untagged pieces as METRC sources (they don't exist in METRC), and the
-- pieces' split to-dos waited for a tag that never comes. Now:
--   * the combine sender (api/metrc/_pkg.js) takes an untagged piece's lbs straight from its parent package (one METRC step)
--   * the combine to-do holds (waits on) the parent tags
--   * a piece that gets merged before it has a tag closes its own split to-do ("not needed")
--   * one-off: closes the split to-dos already stuck this way (C9-C11 were combined by hand in METRC; C8 sends with the fix)
-- Run after 232_orders_realtime.sql. Safe to re-run.
begin;

create or replace function metrc_touch_tags(a comp_metrc_actions) returns text[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct upper(t)) filter (where nullif(trim(t), '') is not null), '{}') from (
    select a.tag as t
    union all select p.package_tag from pallets p where a.details ->> 'type' = 'split_from' and p.id = nullif(a.details ->> 'parent_id', '')::bigint
    union all select p.package_tag from pallets p where a.details ->> 'type' = 'merge' and p.merged_into = a.pallet_id
    -- 233: an untagged piece in a merge comes straight off its parent package
    union all select pp.package_tag from pallets p join pallets pp on pp.id = p.parent_id
               where a.details ->> 'type' = 'merge' and p.merged_into = a.pallet_id and nullif(trim(coalesce(p.package_tag, '')), '') is null
    union all select p.package_tag from events e join pallets p on p.id = e.pallet_id
               where a.details ->> 'type' = 'merge' and e.type = 'combine_part' and e.details ->> 'into_id' = a.pallet_id::text
    union all select p.package_tag from pallets p where a.details ->> 'type' = 'tag_set' and a.details ->> 'from' is not null and p.id = a.pallet_id
    union all select a.details ->> 'from' where a.details ->> 'type' in ('tag_set', 'proc_retag', 'repackage')
    union all select a.details ->> 'old_tag' where a.details ->> 'type' = 'proc_received'
    union all select jsonb_array_elements_text(case when jsonb_typeof(a.details -> 'tags') = 'array' then a.details -> 'tags' else '[]'::jsonb end)
  ) x
$$;

-- a piece merged before it has a tag: its split isn't needed (the combine takes the lbs from the parent)
create or replace function _piece_merged_close_split() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.merged_into is not null and old.merged_into is null and nullif(trim(coalesce(new.package_tag, '')), '') is null then
    update comp_metrc_actions
       set status = 'done', push_error = null, done_at = now(), done_by = 'Lifted App (not needed)',
           note = left('Not needed: ' || new.code || ' went into combine ' || coalesce((select code from pallets where id = new.merged_into), '?')
                       || ' before it had a tag; METRC takes it straight from the parent', 500)
     where kind = 'split' and pallet_id = new.id and status in ('todo', 'error') and coalesce(push_state, '') <> 'sending';
  end if;
  return new;
end $$;
drop trigger if exists piece_merged_close_split on pallets;
create trigger piece_merged_close_split after update of merged_into on pallets for each row execute function _piece_merged_close_split();

-- one-off: the split to-dos stuck this way now (11/6: P135-1, P707-1, P704-1, P338-2, P343-2, P367-2, P361-1)
update comp_metrc_actions a
   set status = 'done', push_error = null, done_at = now(), done_by = 'Lifted App (not needed)',
       note = left('Not needed: ' || p.code || ' went into combine ' || coalesce(m.code, '?') || ' before it had a tag; METRC takes it straight from the parent (C9-C11 were combined by hand)', 500)
  from pallets p left join pallets m on m.id = p.merged_into
 where a.kind = 'split' and a.pallet_id = p.id and a.status in ('todo', 'error') and coalesce(a.push_state, '') <> 'sending'
   and p.merged_into is not null and nullif(trim(coalesce(p.package_tag, '')), '') is null;

-- refresh the stored tags on open combine to-dos (C8 #922 now holds P361 and P367's tags)
update comp_metrc_actions a set touch_tags = metrc_touch_tags(a) where a.kind = 'combine' and a.status in ('todo', 'error');

commit;

select id, kind, status, code, left(note, 90) as note, touch_tags from comp_metrc_actions
 where id in (893, 895, 896, 912, 913, 914, 922, 924) order by id;
