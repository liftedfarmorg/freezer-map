-- Migration 207: a load can't leave while a pallet on it still has an open "receive in METRC" to-do (Aziz 11/4).
-- L-1104-5 left GVR for Punch Media with M12 whose receive (#810) was never sent; the app made the Punch manifest anyway.
-- load_blockers (shown on the load and checked by Depart) now lists each such pallet: "M12 isn't received in METRC yet (to-do #810)".
-- The METRC sender also sends an open receive before any manifest (api/metrc/_xfer.js), so this is the early warning.
-- Patches load_blockers in place (later migrations changed it), so it keeps everything else it checks. Safe to re-run. Run after 206.
set client_min_messages = warning;

do $$
declare d text := pg_get_functiondef('load_blockers(integer)'::regprocedure);
        add text := $add$
  -- 207: nothing leaves before its license has received it in METRC
  declare rb record;
  begin
    for rb in
      select distinct p.code, a.id
        from load_items li join pallets p on p.id = li.pallet_id
        left join pallets c on c.container_id = p.id
        join comp_metrc_actions a on a.kind = 'receive' and a.status in ('todo', 'error')
             and (a.pallet_id = p.id or a.pallet_id = c.id or upper(a.tag) = upper(p.package_tag) or upper(a.tag) = upper(c.package_tag))
       where li.load_id = p_load
       order by p.code
    loop
      r := r || jsonb_build_object('text', rb.code || ' isn''t received in METRC yet (to-do #' || rb.id || '). Send it in Compliance › METRC to do first.');
    end loop;
  end;
  return r;
end$add$;
        n int;
begin
  if position('207: nothing leaves before' in d) > 0 then raise notice 'load_blockers already has the 207 check'; return; end if;
  n := (length(d) - length(replace(d, 'return r;', ''))) / length('return r;');
  if n < 1 then raise exception 'load_blockers is not what 207 expects (no "return r;"); nothing changed'; end if;
  -- replace only the last "return r; end" (the function's own end)
  d := regexp_replace(d, 'return r;\s*end\s*(\$[a-z_]*\$)\s*$', replace(add, '\', '\\') || ' \1', '');
  if position('207: nothing leaves before' in d) = 0 then raise exception 'Could not patch load_blockers; nothing changed'; end if;
  execute d;
end $$;
