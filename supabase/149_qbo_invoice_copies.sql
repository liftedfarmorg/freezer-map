-- 149: QuickBooks invoice copies on the customer statement (Matt, 11/1). QuickBooks is the source of truth for invoices and AR.
--  * acct_qbo_docs: every QuickBooks invoice and credit memo for a matched customer, open ones (any age) and the last 12 months:
--    number, dates, lines, total, balance, and the app invoice it's linked to (if any). Filled by the hourly check (api/qbo/cron.js).
--  * private bucket qbo-docs: QuickBooks' own PDF of each one. Only the server reads and writes it; people get a 5-minute link
--    from api/qbo/doc.js after acct_doc_access says yes (Sales / Accounting: any customer; a customer: only their own).
--  * customer_statement: once QuickBooks has sent the copies, the statement's invoice list comes from QuickBooks (each one opens
--    QuickBooks' copy). Until then it stays the app's own invoices, as before.
-- Run once in Supabase. Safe to re-run. RUN LIVE 11/1/2026 (Matt, via Claude). The live customer_statement matched 060 (only Windows line endings differed).
begin;

create table if not exists acct_qbo_docs (
  env             text not null,
  kind            text not null check (kind in ('Invoice', 'CreditMemo')),
  qbo_id          text not null,
  customer_id     int references customers(id) on delete set null,
  qbo_customer_id text,
  doc_number      text,
  txn_date        date,
  due_date        date,
  total           numeric,
  balance         numeric,                        -- invoice: still owed; credit memo: credit left
  lines           jsonb not null default '[]',    -- [{item, description, qty, price, amount}]
  memo            text,
  invoice_id      int references invoices(id) on delete set null,   -- the app's invoice, when linked
  qbo_updated_at  timestamptz,                    -- QuickBooks' last change
  pdf_path        text,                           -- in the qbo-docs bucket
  pdf_at          timestamptz,                    -- when that PDF was taken (older than qbo_updated_at = fetch again)
  synced_at       timestamptz not null default now(),
  primary key (env, kind, qbo_id)
);
create index if not exists acct_qbo_docs_customer on acct_qbo_docs (customer_id, env, kind, txn_date desc);
create index if not exists acct_qbo_docs_invoice on acct_qbo_docs (invoice_id) where invoice_id is not null;
alter table acct_qbo_docs enable row level security;
drop policy if exists read_docs on acct_qbo_docs;
create policy read_docs on acct_qbo_docs for select to authenticated
  using (has_module('accounting') or is_sales() or (customer_id is not null and customer_id = my_customer()));
revoke all on acct_qbo_docs from anon;
grant select on acct_qbo_docs to authenticated;
grant all on acct_qbo_docs to service_role;

-- QuickBooks' PDFs: private, no read or write policies for people (the server uses the service role)
insert into storage.buckets (id, name, public, file_size_limit)
values ('qbo-docs', 'qbo-docs', false, 10485760)
on conflict (id) do update set public = false;

-- may this person open a copy for this customer? (called as them by api/qbo/doc.js)
create or replace function acct_doc_access(p_customer int) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(is_sales() or has_module('accounting') or (p_customer is not null and my_customer() = p_customer), false)
$$;
revoke execute on function acct_doc_access(int) from public, anon;
grant execute on function acct_doc_access(int) to authenticated;

-- one customer's dashboard and statement (060), now with QuickBooks' invoices once they're here
create or replace function customer_statement(p_customer int default null, p_from date default null) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_c int := coalesce(my_customer(), case when is_sales() or has_module('accounting') then p_customer end);
  v_env text := case when exists (select 1 from qbo_connection where env = 'production' and active) then 'production' end;
  v_from date := coalesce(p_from, (current_date - interval '12 months')::date);
  v_month date := date_trunc('month', current_date)::date;
  v_year int := crop_year();
  cu customers; b acct_customer_balances; t record;
  v_inv jsonb; v_src text := 'app'; v_app_bal numeric; v_app_due numeric; v_shipped numeric; v_pending numeric; v_res jsonb;
begin
  if v_c is null then return null; end if;
  select * into cu from customers where id = v_c;
  if cu.id is null then return null; end if;
  if v_env is not null then select * into b from acct_customer_balances where customer_id = v_c and env = v_env; end if;
  select * into t from terms_for(v_c, v_year) limit 1;

  if b.balance is not null and exists (select 1 from acct_qbo_docs d where d.env = v_env and d.customer_id = v_c and d.kind = 'Invoice') then
    -- QuickBooks' invoices (the source of truth); each opens QuickBooks' copy
    v_src := 'quickbooks';
    select coalesce(jsonb_agg(x order by x.invoice_date desc nulls last, x.inv_number desc), '[]') into v_inv from (
      select coalesce(d.invoice_id, 0) as id, d.doc_number as inv_number, d.txn_date as invoice_date, d.due_date, d.total,
             case when d.balance > 0 then 'open' else 'paid' end as status, ai.terms_label, ai.po_number, null::text as share_token,
             o.so_number, d.balance, (d.balance > 0 and d.due_date < current_date) as past_due, d.qbo_id, d.kind
        from acct_qbo_docs d
        left join invoices ai on ai.id = d.invoice_id
        left join orders o on o.id = ai.order_id
       where d.env = v_env and d.customer_id = v_c and d.kind = 'Invoice' and d.total <> 0 and (d.txn_date >= v_from or d.balance > 0)
    ) x;
  else
    -- invoices from the app (newest first), each with QuickBooks' balance when it has one
    select coalesce(jsonb_agg(x order by x.invoice_date desc, x.id desc), '[]') into v_inv from (
      select i.id, i.inv_number, i.invoice_date, i.due_date, i.total, i.status, i.terms_label, i.po_number, i.share_token,
             o.so_number,
             case when i.status = 'void' then 0 when i.status = 'paid' then 0
                  when p.balance is not null then p.balance else i.total end as balance,
             (i.status = 'open' and coalesce(p.balance, i.total) > 0 and i.due_date < current_date) as past_due
        from invoices i
        left join orders o on o.id = i.order_id
        left join acct_pushes p on p.invoice_id = i.id and p.env = v_env
       where i.customer_id = v_c and i.status <> 'void' and (i.invoice_date >= v_from or i.status = 'open')
    ) x;
  end if;
  select coalesce(sum((e ->> 'balance')::numeric), 0), coalesce(sum((e ->> 'balance')::numeric) filter (where (e ->> 'past_due')::boolean), 0)
    into v_app_bal, v_app_due from jsonb_array_elements(v_inv) e;

  -- fresh frozen picked up this month, and what's ordered but not shipped yet
  select coalesce(sum(l.lbs) filter (where o.status = 'shipped' and coalesce(o.shipped_date, o.order_date) >= v_month), 0),
         coalesce(sum(l.lbs) filter (where o.status in ('pending','submitted')), 0)
    into v_shipped, v_pending
    from orders o join order_lines l on l.order_id = o.id
   where o.customer_id = v_c and l.product = 'fresh_frozen';
  select jsonb_build_object('reserved', coalesce(sum(r.reserved), 0), 'shipped', coalesce(sum(r.shipped), 0), 'pending', coalesce(sum(r.pending), 0),
                            'remaining', coalesce(sum(r.remaining), 0), 'strains', count(*))
    into v_res from reserve_balances r where r.customer_id = v_c and coalesce(r.crop_year, v_year) = v_year;

  return jsonb_build_object(
    'customer', jsonb_build_object('id', cu.id, 'name', cu.name, 'terms', cu.payment_terms),
    'balance', jsonb_build_object(
       'amount', case when b.balance is not null then b.balance else v_app_bal end,
       'past_due', case when b.balance is not null then coalesce((select sum((e ->> 'balance')::numeric) from jsonb_array_elements(b.open_items) e
                                                                    where e ->> 'type' = 'Invoice' and (e ->> 'due')::date < current_date), 0) else v_app_due end,
       'source', case when b.balance is not null then 'quickbooks' else 'app' end,
       'synced_at', b.synced_at),
    'open_items', case when b.balance is not null then b.open_items else '[]'::jsonb end,
    'invoices', v_inv,
    'invoices_source', v_src,
    'month', jsonb_build_object('start', v_month, 'shipped', v_shipped, 'min', t.monthly_min_lbs,
                                'left', case when t.monthly_min_lbs is not null then greatest(t.monthly_min_lbs - v_shipped, 0) end),
    'pending_lbs', v_pending,
    'reserves', v_res || jsonb_build_object('year', v_year),
    'contract_lbs', t.contract_lbs,
    'price_per_lb', t.price_per_lb,
    'from', v_from
  );
end $$;
revoke execute on function customer_statement(int, date) from public, anon;
grant execute on function customer_statement(int, date) to authenticated;

commit;

select (select count(*) from information_schema.tables where table_name = 'acct_qbo_docs') as copies_table,
       (select count(*) from storage.buckets where id = 'qbo-docs') as pdf_bucket,
       position('acct_qbo_docs' in pg_get_functiondef('customer_statement(int,date)'::regprocedure)) > 0 as statement_updated;
