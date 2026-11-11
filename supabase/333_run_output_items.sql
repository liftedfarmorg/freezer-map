-- RUN LIVE 11/11 by Claude (Aziz OK to build). Tested first in a rolled-back transaction.
-- 333: Pick the item for each output of a processing run (Aziz 11/11, Msg PROC-ITEM-1/2).
--   * proc_finish_run_items(run, outputs [{product, lbs, tag, item_id}], mold, notes, on): wraps proc_finish_run.
--     - Crop year: the run takes its inputs' crop year when it has none (B-261106-1 had none, so D7219/D7220 got no item).
--       Still none = refused. Outputs always keep the run's crop year (Aziz: the year follows the input).
--     - item_id per line (optional): must be that crop year, and its product must match the line's. A different strain is
--       allowed for anyone (mix-ups, renames); the output then takes that strain.
--     - No item_id: the default item = the run's strain, that year, that product, at the farm of the first input's item
--       (else where the input was grown). Made as an item card if it doesn't exist yet (same as before).
--     - Every output must end up with an item, or nothing is saved.
--   * pallet_item_guess: a run output's farm is the input's item farm (G4217 at GVR on an FL26OH item -> FL26OH outputs).
--   * pallet_set_item_lot: an item set on purpose in an update is kept (no re-guess over it).
--   * The old proc_finish_run is unchanged (and still patched by 049/051/057); the app calls the new one.
-- Safe to re-run.
begin;

create or replace function _run_crop_year(p_run bigint) returns int
language sql stable security definer set search_path = public as $$
  select case when count(distinct p.crop_year) = 1 then min(p.crop_year) end
    from proc_run_inputs i join pallets p on p.id = i.pallet_id where i.run_id = p_run and p.crop_year is not null
$$;

-- the farm an output's item belongs to: the first input's item farm, else where the input was grown
create or replace function _run_item_site(p_run bigint) returns text
language sql stable security definer set search_path = public as $$
  select coalesce(it.site, split_part(p.origin_site, '+', 1))
    from proc_run_inputs i join pallets p on p.id = i.pallet_id left join items it on it.id = p.item_id
   where i.run_id = p_run order by i.id limit 1
$$;

-- run outputs: the item farm is the input's item farm (not where the package happens to be / was grown); no stray cards
create or replace function pallet_item_guess(p pallets) returns bigint
language sql stable security definer set search_path = public as $$
  select item_for(
    coalesce(p.crop_year, (select h.crop_year from cult_harvests h where h.id = coalesce(p.harvest_id, p.from_harvest)),
             extract(year from p.harvest_date)::int),
    case when p.run_id is not null then coalesce(_run_item_site(p.run_id), p.origin_site) else p.origin_site end,
    (select code from finishes where pallet_product = coalesce(p.product, 'fresh_frozen')),
    strain_id_of(p.strain), 'OCAL',
    case when p.product = 'dry_biomass' then harvest_season(coalesce(p.harvest_date, current_date)) else 'FL' end)
$$;

-- an item set on purpose in the same update wins over the guess (a strain fix that also picks the item)
create or replace function pallet_set_item_lot() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.kind is distinct from 'mixed' then
    if new.lot_id is null then new.lot_id := pallet_lot_guess(new); end if;
    if tg_op = 'UPDATE' and new.item_id is not null and new.item_id is distinct from old.item_id then
      return new;
    end if;
    if tg_op = 'INSERT' or new.item_id is null
       or new.strain is distinct from old.strain or new.origin_site is distinct from old.origin_site
       or new.product is distinct from old.product or new.crop_year is distinct from old.crop_year then
      new.item_id := coalesce(pallet_item_guess(new), case when tg_op = 'UPDATE' then old.item_id end);
    end if;
  end if;
  return new;
end $$;

create or replace function proc_finish_run_items(p_run bigint, p_outputs jsonb, p_mold numeric default 0, p_notes text default null, p_on date default null)
returns text[]
language plpgsql security definer set search_path = public as $$
declare r proc_runs; yr int; site_ text; x jsonb; lines jsonb := '[]'; it items; fin text; prod text; codes text[]; k int := 0; p pallets; want bigint;
begin
  perform proc_require();
  select * into r from proc_runs where id = p_run for update;
  if r.id is null then raise exception 'Run not found'; end if;
  if r.status <> 'open' then raise exception 'Run % is already %', r.code, r.status; end if;
  yr := coalesce(r.crop_year, _run_crop_year(r.id));
  if yr is null then raise exception 'The input packages of % have no crop year. Set it on the input package first.', r.code; end if;
  if r.crop_year is null then update proc_runs set crop_year = yr, updated_at = now() where id = r.id; end if;
  site_ := _run_item_site(r.id);

  -- the item for every line that will be saved (same order proc_finish_run makes them)
  for x in select * from jsonb_array_elements(coalesce(p_outputs, '[]')) loop
    if coalesce(nullif(x ->> 'lbs', '')::numeric, 0) = 0 then continue; end if;
    prod := x ->> 'product';
    fin := (select code from finishes where pallet_product = prod);
    if nullif(x ->> 'item_id', '') is not null then
      select * into it from items where id = (x ->> 'item_id')::bigint;
      if it.id is null then raise exception 'That item is gone. Pick it again.'; end if;
      if it.crop_year <> yr then raise exception '% is % crop. This run is % (the year follows the input).', it.metrc_name, it.crop_year, yr; end if;
      if it.finish is distinct from fin then raise exception '% isn''t % . Pick a % item or change the line.', it.metrc_name, prod, prod; end if;
      want := it.id;
    else
      want := item_for(yr, site_, fin, strain_id_of(r.strain));
      if want is null then raise exception 'No item for % % % at %. Pick one on the line.', r.strain, yr, prod, coalesce(site_, '?'); end if;
    end if;
    lines := lines || jsonb_build_array(want);
  end loop;

  codes := proc_finish_run(p_run, p_outputs, p_mold, p_notes, p_on);
  if cardinality(codes) <> jsonb_array_length(lines) then raise exception 'Outputs don''t line up (% made, % items)', cardinality(codes), jsonb_array_length(lines); end if;

  for k in 1 .. cardinality(codes) loop
    select * into p from pallets where code = codes[k] and run_id = r.id;
    select * into it from items where id = (lines ->> (k - 1))::bigint;
    -- strain (a mix-up) and item together; the trigger keeps an item set on purpose
    update pallets set crop_year = yr, strain = coalesce((select name from strains where id = it.strain_id), strain), item_id = it.id, updated_at = now()
     where id = p.id;
    if (select item_id from pallets where id = p.id) is distinct from it.id then raise exception 'Couldn''t set the item on %', p.code; end if;
  end loop;
  return codes;
end $$;
revoke all on function proc_finish_run_items(bigint, jsonb, numeric, text, date) from public, anon;
grant execute on function proc_finish_run_items(bigint, jsonb, numeric, text, date) to authenticated;
revoke all on function _run_crop_year(bigint), _run_item_site(bigint) from public, anon;
grant execute on function _run_crop_year(bigint), _run_item_site(bigint) to authenticated;

select '333 run output items' as ok;
commit;
