-- 187: "Send to GVR" on an order now moves its mixed pallets (Msg SPLIT-9, 11/4). App only, nothing to METRC.
-- Bear Labs SO-26110301: all 34 packages are on mixed pallets M9, M10, M11 at OHR, and Send to GVR said
-- "Nothing to send: every pallet on this order is at GVR or already on a load": order_transfer() skipped any picked package
-- inside a mixed pallet (container_id is not null). Now it sends the top pallet (the mixed pallet, or the loose package) once.
-- Patches the live function text; stops if it isn't what it expects. Run live by Claude 11/4. Safe to re-run.
do $$
declare d text;
begin
  d := pg_get_functiondef('order_transfer(integer, integer, text)'::regprocedure);
  if position('coalesce(c.container_id, c.id)' in d) > 0 then raise notice 'already applied'; return; end if;
  if position('for pk in select p.id from order_picks x join pallets p on p.id = x.pallet_id' in d) = 0
     or position('where x.order_id = o.id and p.container_id is null and coalesce(pallet_site(p), '''') <> site and p.status in (''in_freezer'', ''unslotted'') order by p.code loop' in d) = 0 then
    raise exception 'order_transfer is not what this expects; nothing changed';
  end if;
  d := replace(d, 'for pk in select p.id from order_picks x join pallets p on p.id = x.pallet_id',
                  'for pk in select distinct t.id, t.code from order_picks x join pallets c on c.id = x.pallet_id join pallets t on t.id = coalesce(c.container_id, c.id)');
  d := replace(d, 'where x.order_id = o.id and p.container_id is null and coalesce(pallet_site(p), '''') <> site and p.status in (''in_freezer'', ''unslotted'') order by p.code loop',
                  'where x.order_id = o.id and t.container_id is null and coalesce(pallet_site(t), '''') <> site and t.status in (''in_freezer'', ''unslotted'') order by t.code loop   -- mixed pallets go as one');
  execute d;
end $$;
