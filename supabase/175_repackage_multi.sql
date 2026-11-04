-- RUN LIVE 11/3 by Claude (Management API as Aziz): success.
-- 175: Processing > Needs our tag > Repackage: several tags, items and weights at once (Aziz 11/3, msg 1103-C).
--  p_lines = [{tag, item_id, lbs}, ...]. Lines go in order, in one transaction: each line is a split piece onto our tag
--  (new_package part of it), except a last line that takes everything left, which repackages the package itself (all of it).
--  Total can't be more than the package. Anything left over stays on the processor's tag (still Needs our tag).
begin;

create or replace function proc_repackage_multi(p_pallet bigint, p_lines jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare p pallets; x jsonb; i int := 0; n int; lbs numeric; total numeric := 0; tag text; item bigint; r pallets; res jsonb := '[]';
begin
  perform proc_admin_check();
  select * into p from pallets where id = p_pallet for update;
  if p.id is null then raise exception 'Package not found'; end if;
  if p.current_weight is null then raise exception '% has no weight', p.code; end if;
  n := coalesce(jsonb_array_length(p_lines), 0);
  if n = 0 then raise exception 'Add at least one tag'; end if;
  for x in select * from jsonb_array_elements(p_lines) loop
    lbs := nullif(x ->> 'lbs', '')::numeric;
    tag := upper(nullif(trim(coalesce(x ->> 'tag', '')), ''));
    if lbs is null or lbs <= 0 then raise exception 'Line %: enter the lbs', i + 1; end if;
    if tag is null then raise exception 'Line %: enter the tag (the label you put on)', i + 1; end if;
    total := total + lbs;
    i := i + 1;
  end loop;
  if total > p.current_weight + 0.0001 then raise exception 'That''s % lb, % only has % lb', round(total, 2), p.code, p.current_weight; end if;
  i := 0;
  for x in select * from jsonb_array_elements(p_lines) loop
    i := i + 1;
    lbs := (x ->> 'lbs')::numeric;
    tag := upper(trim(x ->> 'tag'));
    item := nullif(x ->> 'item_id', '')::bigint;
    select current_weight into p.current_weight from pallets where id = p.id;
    -- the last line takes everything left: repackage the package itself (keeps its number, spot and history)
    if i = n and lbs >= p.current_weight - 0.0001 then lbs := p.current_weight; end if;
    r := new_package(p.id, lbs, tag, false, null, item, 'Repackaged from processor tag ' || upper(coalesce(p.package_tag, '')), false);
    res := res || jsonb_build_object('code', r.code, 'tag', r.package_tag, 'lbs', lbs, 'whole', r.id = p.id);
  end loop;
  return jsonb_build_object('code', p.code, 'lines', res, 'left', (select current_weight from pallets where id = p.id and their_tag));
end $$;
revoke all on function proc_repackage_multi(bigint, jsonb) from public, anon;
grant execute on function proc_repackage_multi(bigint, jsonb) to authenticated;

commit;

select '175' as ok, (select count(*) from pg_proc where proname = 'proc_repackage_multi') as fn;
