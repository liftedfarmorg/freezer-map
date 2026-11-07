-- 226: The METRC check (225) also flags packages a customer accepted at a lower weight than we shipped (Aziz 11/6, Msg #272).
--  * 1 lb or more short on any accepted package: alert to Distribution Admins (Rama) and an Accounting flag
--    (the invoice is for what we shipped; credit memo if Sales agrees). Alerts once per finding. Safe to re-run.
begin;

CREATE OR REPLACE FUNCTION public.metrc_stop_check()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare s record; n int := 0; late text; acc text; got text; shrt text; short_lbs numeric; key text;
begin
  for s in select st.id, st.seq, st.manifest, st.outcome, st.outcome_reason, l.id as load_id, l.code as load, c.name as customer,
                  nullif(regexp_replace(st.manifest, '\D', '', 'g'), '')::bigint as mid
             from load_stops st join loads l on l.id = st.load_id join customers c on c.id = st.customer_id
            where st.outcome is not null and st.outcome <> 'dropped_off' and nullif(trim(coalesce(st.manifest, '')), '') is not null
              and st.outcome_at > now() - interval '45 days' and c.kind = 'external' and st.manifest_voided_at is null loop
    continue when s.mid is null or not exists (select 1 from metrc_transfer_packages tp where tp.delivery_id = s.mid);
    with drv as (   -- what the driver said came back rejected
      select upper(p.package_tag) as label from stop_returns r join pallets p on p.id = r.pallet_id
       where r.stop_id = s.id and r.kind = 'rejected' and r.cancelled_at is null and p.package_tag is not null),
    mt as (
      select upper(tp.label) as label, lower(coalesce(tp.state, '')) as st, tp.shipped_lbs, tp.received_lbs from metrc_transfer_packages tp where tp.delivery_id = s.mid)
    select string_agg(mt.label, ', ' order by mt.label) filter (where (mt.st like 'reject%' or mt.st like 'return%') and s.outcome in ('delivered', 'partly_rejected')
                                                                 and not exists (select 1 from drv where drv.label = mt.label)),
           string_agg(mt.label, ', ' order by mt.label) filter (where mt.st like 'accept%' and exists (select 1 from drv where drv.label = mt.label)),
           string_agg(mt.label, ', ' order by mt.label) filter (where mt.st like 'accept%' and s.outcome = 'not_delivered'),
           -- 226: accepted at a lower weight than we shipped (1 lb or more short)
           string_agg(mt.label || ' (' || round(mt.shipped_lbs, 1) || ' shipped, ' || round(mt.received_lbs, 1) || ' received)', ', ' order by mt.label)
             filter (where mt.st like 'accept%' and mt.received_lbs is not null and mt.shipped_lbs - mt.received_lbs >= 1),
           sum(mt.shipped_lbs - mt.received_lbs) filter (where mt.st like 'accept%' and mt.received_lbs is not null and mt.shipped_lbs - mt.received_lbs >= 1)
      into late, acc, got, shrt, short_lbs from mt;
    if late is not null then
      key := 'late:' || md5(late);
      if not exists (select 1 from app_alerts a where a.kind = 'stop_metrc' and a.ref ->> 'stop_id' = s.id::text and a.ref ->> 'check' = key) then
        perform _alert('distribution', true, 'stop_metrc', 'METRC: ' || s.customer || ' rejected packages the driver marked delivered (manifest ' || s.manifest || ')',
          s.load || ' stop ' || s.seq || ': ' || late || ' rejected in METRC. They need to come back on a return manifest; flagged for a back-end fix.',
          jsonb_build_object('stop_id', s.id, 'load_id', s.load_id, 'check', key));
        perform _alert('accounting', false, 'acct_flag', 'Late rejection: ' || s.customer || ', manifest ' || s.manifest,
          'METRC shows ' || late || ' rejected after the driver recorded the stop as delivered (' || s.load || ' stop ' || s.seq || '). Its invoice may need a credit memo once the return manifest is in.',
          jsonb_build_object('stop_id', s.id, 'load_id', s.load_id, 'check', key));
        n := n + 1;
      end if;
    end if;
    if acc is not null then
      key := 'acc:' || md5(acc);
      if not exists (select 1 from app_alerts a where a.kind = 'stop_metrc' and a.ref ->> 'stop_id' = s.id::text and a.ref ->> 'check' = key) then
        perform _alert('distribution', true, 'stop_metrc', 'METRC: ' || s.customer || ' accepted packages the driver says were rejected (manifest ' || s.manifest || ')',
          s.load || ' stop ' || s.seq || ': ' || acc || ' accepted in METRC. Have them reject it in METRC or send a return manifest.',
          jsonb_build_object('stop_id', s.id, 'load_id', s.load_id, 'check', key));
        n := n + 1;
      end if;
    end if;
    if got is not null then
      key := 'got:' || md5(got);
      if not exists (select 1 from app_alerts a where a.kind = 'stop_metrc' and a.ref ->> 'stop_id' = s.id::text and a.ref ->> 'check' = key) then
        perform _alert('distribution', true, 'stop_metrc', 'METRC: ' || s.customer || ' received manifest ' || s.manifest || ', but the stop is Not delivered',
          s.load || ' stop ' || s.seq || ': ' || got || ' accepted in METRC. The manifest can''t be voided now. Sort it out in METRC (return manifest), and check the stop outcome.',
          jsonb_build_object('stop_id', s.id, 'load_id', s.load_id, 'check', key));
        n := n + 1;
      end if;
    end if;
    if shrt is not null then
      key := 'short:' || md5(shrt);
      if not exists (select 1 from app_alerts a where a.kind = 'stop_metrc' and a.ref ->> 'stop_id' = s.id::text and a.ref ->> 'check' = key) then
        perform _alert('distribution', true, 'stop_metrc', 'METRC: ' || s.customer || ' received ' || round(short_lbs, 1) || ' lbs less than we shipped (manifest ' || s.manifest || ')',
          s.load || ' stop ' || s.seq || ': ' || shrt || '. Check the weights with them; the package weights in METRC are now lower than ours.',
          jsonb_build_object('stop_id', s.id, 'load_id', s.load_id, 'check', key));
        perform _alert('accounting', false, 'acct_flag', 'Short received: ' || s.customer || ', ' || round(short_lbs, 1) || ' lbs (manifest ' || s.manifest || ')',
          'They accepted ' || shrt || ' (' || s.load || ' stop ' || s.seq || '). The invoice is for what we shipped; a credit memo may be needed if Sales agrees.',
          jsonb_build_object('stop_id', s.id, 'load_id', s.load_id, 'check', key));
        n := n + 1;
      end if;
    end if
;
  end loop;
  return n;
end $function$
;

commit;
