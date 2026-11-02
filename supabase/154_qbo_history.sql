-- 154: Sales orders + invoices history from QuickBooks (production), matched to METRC manifests. Msg FULFILL-QBO-1/4 (renamed from 153, which another session used), 11/1/2026.
-- v2 11/1 (history from Nov 2025; deposits/storage later; Dry Biomass its own category). RUN LIVE by Claude 11/1 after Aziz's go: 223 new orders, 18 existing orders invoiced, 241 invoices, 1,804 order lines, 0 able to push.
-- (variable "code" renamed v_code: the live strains table has a code column)
--
-- QuickBooks is NOT touched. Everything comes from acct_qbo_docs (the app's hourly read-only copy of production QuickBooks:
-- every invoice for a matched customer, last 12 months + anything still open).
--
-- What it does
--  1. Existing app orders whose QuickBooks invoice has the same SO number (17 Roshi orders) + SO-26100801 (QuickBooks SO-26102704,
--     same 7 x 10 lb samples on manifest 0011666365) get an app invoice copied from QuickBooks and linked to it.
--  2. Every other QuickBooks product invoice (fresh frozen, standards, smalls, trim) gets a shipped sales order (source 'qbo',
--     same SO number) with its lines, plus a linked app invoice. Ship date = METRC manifest date when one was matched, else the invoice date.
--  3. NOT in this run (Aziz 11/1, later): deposits, storage fees, shipping-only invoices, and the 7 Dry Biomass-only invoices
--     (Dry Biomass is its own product category, not in the app yet). SO-26030601 (TSL, fresh frozen + biomass) comes in:
--     its biomass lines stay on the invoice copy but get no order line.
--  4. App invoices already linked to QuickBooks with a $0 balance there are marked paid (SO-26102501 Jetty, SO-26102202 Jetty).
--  5. MAR SR SO-26102205: shipped date 10/28 and manifest 0011779258 filled in.
--
-- Nothing goes to QuickBooks: every invoice made here is recorded as already in QuickBooks (acct_pushes 'sent' with the QuickBooks id,
-- acct_status 'sent', no push clock), the auto-push and auto shipping-line triggers are off while it runs, and line_map is empty so
-- prices are never pulled back over them. Nothing goes to METRC. Pallets and inventory are not touched (no picks, no package tags).
-- Safe to re-run: anything already linked is skipped.
begin;

-- 0. orders can say they came from QuickBooks
alter table orders drop constraint if exists orders_source_check;
alter table orders add constraint orders_source_check check (source in ('app', 'portal', 'roshi', 'qbo'));

-- 1. no push clocks, no automatic shipping lines while we copy
alter table invoices disable trigger invoice_queue_push;
alter table invoices disable trigger invoice_shipping_line;
alter table invoice_lines disable trigger invoice_line_bump;

-- QuickBooks invoice id -> METRC manifest it shipped on (matched by customer license, strains, pounds and date; see the plan doc)
create temp table qh_map (qbo_id text primary key, manifest text) on commit drop;
insert into qh_map
select distinct on (split_part(v, ':', 1)) split_part(v, ':', 1), '00' || split_part(v, ':', 2)
  from unnest(string_to_array('22005:07991226 27832:09742701 27834:09757648 27835:09750444 27866:09764310 27867:09764309 27868:09762516 27948:09785471 28033:09793792 28042:09800583 28043:09800685 28056:09798863 28089:09829052 28271:09839802 28272:09837358 28383:09858389 28384:09858391 28385:09862835 28435:09884835 28436:09887642 28441:09897811 28447:09907191 28521:09932715 28792:09948276 28812:09961302 28813:09961185 28814:09961180 28882:10072853 28904:10012637 28931:10041938 28932:10032914 28996:10084634 28997:10084904 29163:10096408 29167:10114361 29186:10012391 29189:10123738 29190:10120541 29218:10144624 29231:10159448 29303:10168375 29364:10176900 29365:10174320 29366:10173877 29367:10173947 29368:10173959 29426:10185744 29427:10188932 29466:10211922 29494:10230004 29495:10232521 29496:10232366 29497:10223584 29503:10239149 29550:10262372 29554:10253472 29583:10276709 29591:10291839 29592:10291842 29594:10301781 29613:10315564 29614:10315645 29615:10315628 29616:10330621 29617:10332832 29618:10332861 29624:10341722 29625:10341193 29647:10349843 29656:10356644 29704:10363974 29961:10383492 30054:10396966 30097:10421415 30098:10416062 30134:10405635 30138:10421366 30139:10435659 30151:10445542 30193:10467728 30194:10467568 30352:10493166 30353:10494929 30354:10493163 30356:10493169 30376:10498784 30377:10498728 30556:10543696 30557:10543744 30558:10543744 30559:10546801 30588:10554736 30589:10554550 30607:10563491 30666:10586579 30768:10598485 30769:10598485 30770:10608335 31123:10637205 31209:10663714 31254:10686183 31255:10680981 31376:10692901 31377:10692781 31378:10692578 31379:10705153 31380:10707874 31402:10710055 31403:10710284 31412:10717983 31503:10750293 31648:10759089 31663:10770379 31677:10778866 31678:10778677 31681:10787771 31685:10793820 31686:10793787 31792:10817003 31793:10818919 31973:10842523 31974:10851943 32028:10872771 32052:10892098 32068:10872907 32081:10890728 32082:10893829 32308:10922342 32309:10917070 32544:10937678 32621:10960531 32702:10979675 32740:11000763 32818:11012201 32819:11011985 32875:11050103 32876:11050102 32877:11043198 32878:11051671 32911:11069296 33111:11093414 33112:11093157 33113:11093228 33460:11103403 33461:11118913 33462:11118854 33549:11145647 33555:11153476 33556:11150770 33607:11180305 33610:11154673 33611:11177492 33612:11153600 33627:11190346 33748:11210707 33904:11230236 33914:11245241 33915:11238851 33963:11213483 33964:11251589 34101:11273300 34102:11274036 34113:11281910 34114:11284131 34115:11276918 34250:11286355 34251:11286645 34252:11286358 34504:11304164 34505:11299845 34540:11316653 34611:11334594 34644:11356569 34645:11356346 34686:11368741 34707:11373011 34798:11391982 34835:11402043 34891:11410277 34892:11410264 34893:11428324 34926:11435226 34927:11436871 34928:11410703 34929:11377080 34972:11451622 35030:11474046 35031:11474143 35033:11485072 35034:11474178 35035:11474153 35036:11474161 35052:11497924 35053:11496796 35054:11458237 35055:11489789 35326:11505885 35524:11533746 35570:11538334 35595:11542571 35613:11559860 35740:11573217 35741:11571939 35742:11575566 35899:11625880 36143:11665375 36348:11692429 36349:11692305 36350:11691896 36351:11702522 36352:11703912 36414:11729713 36524:11744000 36525:11735357 36526:11735716 36644:11666365 36645:11749700 36646:11702377 36647:11702642', ' ')) v where v <> '';

-- the QuickBooks invoices to bring in
create temp table qh_docs on commit drop as
select d.qbo_id, d.doc_number, d.customer_id, d.txn_date, d.due_date, coalesce(d.total, 0) as total, coalesce(d.balance, 0) as balance,
       d.lines, d.memo, m.manifest,
       (select coalesce(t.departed_at, t.created_at, t.received_at)::date from metrc_transfers t where t.manifest = m.manifest
         order by t.departed_at nulls last limit 1) as ship_on,
       exists (select 1 from jsonb_array_elements(d.lines) x
                where coalesce(x ->> 'item', '') ~* 'fresh frozen|dry flower|standards|smalls|trim'
                  and coalesce(x ->> 'item', '') !~* 'storage|biomass') as has_product,
       (select o.id from orders o where o.so_number = d.doc_number
           or (d.qbo_id = '36644' and o.so_number = 'SO-26100801')    -- Frozen California samples: QuickBooks numbered it SO-26102704
         order by o.id limit 1) as order_id
  from acct_qbo_docs d left join qh_map m on m.qbo_id = d.qbo_id
 where d.env = 'production' and d.kind = 'Invoice' and d.customer_id is not null and d.invoice_id is null
   and not exists (select 1 from acct_pushes p where p.env = 'production' and p.status = 'sent' and p.qbo_id = d.qbo_id);

-- later (Aziz 11/1): no-product invoices (deposits, storage, shipping only, Dry Biomass only) unless they belong to an existing order
delete from qh_docs where order_id is null and not has_product;

-- an existing order that already has its own app invoice: left alone, listed at the end for a look
create temp table qh_skipped on commit drop as
select q.* from qh_docs q
 where q.order_id is not null and exists (select 1 from invoices i where i.order_id = q.order_id and i.status <> 'void');
delete from qh_docs q using qh_skipped s where s.qbo_id = q.qbo_id;

do $$
declare
  d qh_docs; x jsonb; k int; o_id int; ol_id int; inv_id int; inv_no text; so_no text;
  it text; ds text; first text; v_code text; strain_name text; cy int; prod text; is_prod boolean; is_bio boolean;
  qty numeric; price numeric; amt numeric; farm text;
  n_orders int := 0; n_linked_orders int := 0; n_invoices int := 0; n_lines int := 0;
begin
  for d in select * from qh_docs order by txn_date, qbo_id loop
    o_id := d.order_id;

    -- a sales order for product invoices that have none yet
    if o_id is null and d.has_product then
      so_no := d.doc_number;
      if so_no is null or exists (select 1 from orders where so_number = so_no) then so_no := coalesce(d.doc_number, 'QBO-' || d.qbo_id) || '-Q'; end if;
      insert into orders (so_number, customer_id, status, roshi_status, order_date, shipped_date, source, notes, created_by, confirmed_at, modified_at)
      values (so_no, d.customer_id, 'shipped', null, d.txn_date, coalesce(d.ship_on, d.txn_date), 'qbo',
              'From QuickBooks invoice ' || coalesce(d.doc_number, d.qbo_id)
                || coalesce(' · METRC manifest ' || d.manifest, ' · no METRC manifest matched'),
              'QuickBooks history import (154)', d.txn_date, now())
      returning id into o_id;
      n_orders := n_orders + 1;
    elsif o_id is not null then
      n_linked_orders := n_linked_orders + 1;
      update orders set shipped_date = coalesce(shipped_date, d.ship_on, d.txn_date) where id = o_id;
    end if;

    -- the app invoice, a copy of QuickBooks'
    inv_no := case when d.doc_number ~ '^SO-' then 'INV-' || substr(d.doc_number, 4) else coalesce(d.doc_number, 'QBO-' || d.qbo_id) end;
    if exists (select 1 from invoices where inv_number = inv_no) then inv_no := inv_no || '-Q'; end if;
    if exists (select 1 from invoices where inv_number = inv_no) then inv_no := inv_no || d.qbo_id; end if;
    insert into invoices (inv_number, order_id, customer_id, invoice_date, due_date, subtotal, total, status, notes,
                          acct_status, acct_ref, acct_push_after, manifest, created_by)
    values (inv_no, o_id, d.customer_id, d.txn_date, coalesce(d.due_date, d.txn_date), d.total, d.total,
            case when d.balance <= 0 then 'paid' else 'open' end,
            'Copied from QuickBooks ' || coalesce(d.doc_number, d.qbo_id) || ' (history import 11/1/2026)' || coalesce(E'\n' || d.memo, ''),
            'sent', d.qbo_id, null, d.manifest, 'QuickBooks history import (154)')
    returning id into inv_id;
    n_invoices := n_invoices + 1;

    k := 0;
    for x in select * from jsonb_array_elements(d.lines) loop
      k := k + 1;
      it := coalesce(x ->> 'item', ''); ds := coalesce(x ->> 'description', '');
      qty := coalesce((x ->> 'qty')::numeric, 1); amt := coalesce((x ->> 'amount')::numeric, 0);
      price := coalesce((x ->> 'price')::numeric, case when qty <> 0 then round(amt / qty, 4) else amt end);
      is_bio := it ~* 'biomass';                       -- Dry Biomass: its own category, invoice line only
      is_prod := it ~* 'fresh frozen|dry flower|standards|smalls|trim' and it !~* 'storage|biomass';
      ol_id := null; strain_name := null; cy := null; prod := null; farm := null;

      if is_prod then
        first := split_part(ds, E'\n', 1);
        v_code := substring(ds from '(?:FL|SU)\d\d-[A-Z]+-[A-Z]+-[A-Z]+-([^\s]+)');
        -- strain: "Name - Fresh Frozen" first line, else the batch code matched to a strain, else the text
        if first ~ ' - (Fresh Frozen|Dry|Standards|Smalls|Trim)' then strain_name := split_part(first, ' - ', 1);
        elsif v_code is not null then
          select s.name into strain_name from strains s
           where regexp_replace(lower(s.name), '[^a-z0-9]', '', 'g') = regexp_replace(lower(v_code), '[^a-z0-9]', '', 'g')
              or exists (select 1 from unnest(coalesce(s.aliases, '{}'::text[])) a
                          where regexp_replace(lower(a), '[^a-z0-9]', '', 'g') = regexp_replace(lower(v_code), '[^a-z0-9]', '', 'g'))
           order by s.active desc nulls last limit 1;
          strain_name := coalesce(strain_name, v_code);
        else strain_name := nullif(trim(first), '');
        end if;
        strain_name := coalesce(strain_name, it);
        -- crop year: FL25 / SU26 in the batch, else the year in the item name, else the crop being sold then (Sep-Dec = that year, Jan-Aug = last year)
        cy := coalesce(2000 + substring(ds from '(?:FL|SU)(\d\d)-')::int, substring(it from '(20\d\d)')::int,
                      case when extract(month from d.txn_date) >= 9 then extract(year from d.txn_date)::int else extract(year from d.txn_date)::int - 1 end);
        farm := case substring(ds from '(?:FL|SU)\d\d-([A-Z]+)-') when 'OH' then 'OH' when 'GV' then 'GV' end;
        prod := case when it ~* 'fresh frozen' then 'fresh_frozen'
                     when it ~* 'standards' then 'standards'
                     when it ~* 'smalls' then 'smalls'
                     when it ~* 'trim' then 'trim'
                     else 'fresh_frozen' end;
        if o_id is not null and d.order_id is null then
          insert into order_lines (order_id, strain, product, lbs, ordered_lbs, price_per_lb, price_override, farm, crop_year)
          values (o_id, strain_name, prod, greatest(qty, 0), greatest(qty, 0), price, true, farm, cy)
          returning id into ol_id;
          n_lines := n_lines + 1;
        elsif o_id is not null then
          -- existing order: tie the invoice line to its order line when the strain matches
          select ol.id into ol_id from order_lines ol
           where ol.order_id = o_id and regexp_replace(lower(ol.strain), '[^a-z0-9]', '', 'g') = regexp_replace(lower(strain_name), '[^a-z0-9]', '', 'g')
           order by abs(ol.lbs - qty) limit 1;
        end if;
      end if;

      insert into invoice_lines (invoice_id, sort, kind, item, description, strain, crop_year, qty, uom, price, amount, order_line_id)
      values (inv_id, k, case when is_prod or is_bio then 'product' else 'charge' end, it, ds, strain_name, cy, qty,
              case when is_prod or is_bio then 'lb' else 'ea' end, price, amt, ol_id);
    end loop;

    -- recorded as already in QuickBooks (never pushed, prices never pulled back)
    insert into acct_pushes (invoice_id, env, status, qbo_id, doc_number, total, balance, error, sent_by, sent_at, synced_at, line_map)
    values (inv_id, 'production', 'sent', d.qbo_id, d.doc_number, d.total, d.balance, null,
            'QuickBooks history import (154), linked to QuickBooks #' || coalesce(d.doc_number, d.qbo_id), now(), now(), null)
    on conflict (invoice_id, env) do nothing;
    update acct_qbo_docs set invoice_id = inv_id where env = 'production' and kind = 'Invoice' and qbo_id = d.qbo_id;
  end loop;

  -- 4. linked invoices QuickBooks says are paid
  update invoices i set status = 'paid', updated_at = now()
    from acct_qbo_docs q
   where q.env = 'production' and q.kind = 'Invoice' and q.invoice_id = i.id and coalesce(q.balance, 0) <= 0 and i.status = 'open';

  -- 5. MAR SR SO-26102205 shipped on manifest 0011779258 (10/28)
  update orders set shipped_date = coalesce(shipped_date, date '2026-10-28') where so_number = 'SO-26102205';
  update invoices set manifest = coalesce(manifest, '0011779258') where inv_number = 'INV-26102205';

  insert into events (user_email, type, note, details)
  values ('QuickBooks history import (154)', 'qbo_history_import', 'Sales orders and invoices copied from QuickBooks (production), read only',
          jsonb_build_object('new_orders', n_orders, 'existing_orders_invoiced', n_linked_orders, 'invoices', n_invoices, 'order_lines', n_lines));
  raise notice 'new orders %, existing orders invoiced %, invoices %, order lines %', n_orders, n_linked_orders, n_invoices, n_lines;
end $$;

alter table invoices enable trigger invoice_queue_push;
alter table invoices enable trigger invoice_shipping_line;
alter table invoice_lines enable trigger invoice_line_bump;

-- check: nothing made here can be pushed
select count(*) as would_push from invoices i
 where i.created_by = 'QuickBooks history import (154)'
   and (i.acct_push_after is not null or not exists (select 1 from acct_pushes p where p.invoice_id = i.id and p.env = 'production' and p.status = 'sent'));

select doc_number as skipped_has_app_invoice, order_id from qh_skipped;

commit;
