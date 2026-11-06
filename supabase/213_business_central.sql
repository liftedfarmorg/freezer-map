-- 213: Business Central trial (Matt 11/5). The app copies invoices that are already in QuickBooks into Business Central.
--  * QuickBooks stays the books: nothing here changes how invoices go to QuickBooks, lock, or get paid / balances.
--  * Only invoices already sent to QuickBooks (acct_pushes status 'sent') on or after the start date are copied, so BC
--    gets final invoices and ties out to QuickBooks invoice by invoice.
--  * bc_pushes: one row per invoice per BC environment (draft / posted / error / deleted).
--  * bc_map: how app products, classes, payment terms and customers match BC (Accounting > Settings > Business Central).
--  * app_settings: bc.auto_push (starts off), bc.post (off = BC drafts only), bc.start_date, bc.use_app_numbers, bc.class_dims.
--  * The BC login (Vercel BC_TENANT_ID / BC_CLIENT_ID / BC_CLIENT_SECRET / BC_ENVIRONMENT / BC_COMPANY) is server only.
-- Safe to re-run. Run after 212.
set client_min_messages = warning;

create table if not exists bc_pushes (
  invoice_id  int not null references invoices(id) on delete cascade,
  env         text not null,                       -- the BC environment name (Vercel BC_ENVIRONMENT)
  status      text not null check (status in ('draft','posted','error','deleted')),
  bc_id       text,
  bc_number   text,
  bc_total    numeric,
  app_total   numeric,
  note        text,
  error       text,
  sent_by     text,
  sent_at     timestamptz not null default now(),
  checked_at  timestamptz,
  primary key (invoice_id, env)
);
create table if not exists bc_push_locks (
  invoice_id int not null, env text not null, at timestamptz not null default now(), primary key (invoice_id, env)
);
create table if not exists bc_map (
  kind        text not null check (kind in ('product','class','terms','customer')),
  key         text not null,                       -- product code / class name|dimension code / terms code / customer id
  value       text not null,                       -- item:NO or account:NO / dimension value code / BC terms code / BC customer no.
  updated_by  text,
  updated_at  timestamptz not null default now(),
  primary key (kind, key)
);
alter table bc_pushes enable row level security;
alter table bc_push_locks enable row level security;
alter table bc_map enable row level security;
revoke all on bc_pushes, bc_push_locks, bc_map from anon, authenticated;

insert into app_settings (key, value) values
  ('bc.auto_push', 'false'), ('bc.post', 'false'), ('bc.start_date', to_char(current_date, 'YYYY-MM-DD')),
  ('bc.use_app_numbers', 'false'), ('bc.class_dims', '')
on conflict (key) do nothing;

create or replace function _bc_start() returns date
language sql stable security definer set search_path = public as $$
  select coalesce((select nullif(value, '')::date from app_settings where key = 'bc.start_date'), current_date)
$$;

-- ---------- server side (service role) ----------
-- invoices to copy: in QuickBooks, outside customer, not void, on or after the start date, not in BC yet (errors retry after an hour)
create or replace function bc_due(p_env text, p_limit int default 25) returns int[]
language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(x.id order by x.invoice_date, x.id), '{}') from (
    select i.id, i.invoice_date
      from invoices i
      join customers c on c.id = i.customer_id and c.kind = 'external'
      join acct_pushes a on a.invoice_id = i.id and a.env = acct_env() and a.status = 'sent'
      left join bc_pushes b on b.invoice_id = i.id and b.env = p_env
     where i.status <> 'void' and i.invoice_date >= _bc_start()
       and (b.invoice_id is null or (b.status = 'error' and b.sent_at < now() - interval '1 hour'))
     order by i.invoice_date, i.id
     limit greatest(coalesce(p_limit, 25), 1)) x
$$;

create or replace function bc_claim(p_inv int, p_env text) returns boolean
language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  insert into bc_push_locks (invoice_id, env, at) values (p_inv, p_env, now())
  on conflict (invoice_id, env) do update set at = now() where bc_push_locks.at <= now() - interval '5 minutes'
  returning true into ok;
  return coalesce(ok, false);
end $$;
create or replace function bc_release(p_inv int, p_env text) returns void
language sql security definer set search_path = public as $$ delete from bc_push_locks where invoice_id = p_inv and env = p_env $$;

-- after a copy (or a failed one). An error never wipes out a copy that's already in BC.
create or replace function bc_record(p_inv int, p_env text, p_status text, p_bc_id text, p_bc_number text, p_bc_total numeric,
                                     p_note text, p_error text, p_by text) returns void
language plpgsql security definer set search_path = public as $$
declare i invoices;
begin
  if auth.role() <> 'service_role' then raise exception 'Server only'; end if;
  select * into i from invoices where id = p_inv;
  if p_status = 'error' then
    insert into bc_pushes (invoice_id, env, status, app_total, error, sent_by, sent_at)
    values (p_inv, p_env, 'error', i.total, p_error, p_by, now())
    on conflict (invoice_id, env) do update set
      status = case when bc_pushes.status in ('draft','posted') then bc_pushes.status else 'error' end,
      error = excluded.error, sent_by = excluded.sent_by,
      sent_at = case when bc_pushes.status in ('draft','posted') then bc_pushes.sent_at else now() end;
  else
    insert into bc_pushes (invoice_id, env, status, bc_id, bc_number, bc_total, app_total, note, error, sent_by, sent_at, checked_at)
    values (p_inv, p_env, p_status, p_bc_id, p_bc_number, p_bc_total, i.total, p_note, null, p_by, now(), now())
    on conflict (invoice_id, env) do update set status = excluded.status, bc_id = excluded.bc_id, bc_number = excluded.bc_number,
      bc_total = excluded.bc_total, app_total = excluded.app_total, note = excluded.note, error = null, sent_by = excluded.sent_by,
      sent_at = now(), checked_at = now();
  end if;
  delete from bc_push_locks where invoice_id = p_inv and env = p_env;
  insert into events (user_email, type, note, details)
  values (coalesce(p_by, 'system'), case when p_status = 'error' then 'bc_error' else 'bc_sent' end, coalesce(p_error, p_note),
          jsonb_build_object('invoice_id', p_inv, 'inv', i.inv_number, 'env', p_env, 'status', p_status, 'bc_number', p_bc_number, 'bc_total', p_bc_total));
end $$;

-- Check Business Central: what BC says now about copies already made (posted or deleted by hand in BC, totals)
-- p_rows: [{"invoice_id": 1, "status": "draft|posted|deleted", "bc_id": "...", "bc_number": "...", "bc_total": 123.45}]
create or replace function bc_checked(p_env text, p_rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare r jsonb; n int := 0;
begin
  if auth.role() <> 'service_role' then raise exception 'Server only'; end if;
  for r in select * from jsonb_array_elements(coalesce(p_rows, '[]')) loop
    update bc_pushes set status = r ->> 'status', bc_id = coalesce(r ->> 'bc_id', bc_id), bc_number = coalesce(r ->> 'bc_number', bc_number),
           bc_total = coalesce((r ->> 'bc_total')::numeric, bc_total), checked_at = now(),
           note = case when r ->> 'status' = 'deleted' then 'Not found in Business Central any more (deleted there?)' else note end
     where invoice_id = (r ->> 'invoice_id')::int and env = p_env and status in ('draft','posted','deleted');
    n := n + 1;
  end loop;
  return n;
end $$;

revoke execute on function bc_due(text, int), bc_claim(int, text), bc_release(int, text),
  bc_record(int, text, text, text, text, numeric, text, text, text), bc_checked(text, jsonb) from public, anon, authenticated;
grant execute on function bc_due(text, int), bc_claim(int, text), bc_release(int, text),
  bc_record(int, text, text, text, text, numeric, text, text, text), bc_checked(text, jsonb) to service_role;
revoke execute on function _bc_start() from public, anon;

-- ---------- what the Business Central screen reads (Accounting) ----------
-- settings, matches, the customers and payment terms on invoices since the start date
create or replace function bc_config() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s date := _bc_start();
begin
  if not (auth.role() = 'service_role' or has_module('accounting')) then raise exception 'The Accounting module isn''t switched on for your account'; end if;
  return jsonb_build_object(
    'settings', coalesce((select jsonb_object_agg(substr(key, 4), value) from app_settings where key like 'bc.%'), '{}'),
    'map', coalesce((select jsonb_agg(jsonb_build_object('kind', kind, 'key', key, 'value', value, 'updated_by', updated_by, 'updated_at', updated_at)
                       order by kind, key) from bc_map), '[]'),
    'customers', coalesce((select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'legal_name', c.legal_name, 'qbo_name', c.qbo_name) order by c.name)
                            from customers c where c.kind = 'external'
                             and exists (select 1 from invoices i where i.customer_id = c.id and i.invoice_date >= s - 30 and i.status <> 'void')), '[]'),
    'terms', coalesce((select jsonb_agg(jsonb_build_object('code', t.terms_code, 'label', t.terms_label) order by t.terms_label)
                        from (select distinct terms_code, terms_label from invoices
                               where terms_code is not null and invoice_date >= current_date - 400) t), '[]'));
end $$;

-- invoices since the start date with QuickBooks and Business Central side by side (the tie-out)
create or replace function bc_list(p_env text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare s date := _bc_start();
begin
  if not has_module('accounting') then raise exception 'The Accounting module isn''t switched on for your account'; end if;
  return coalesce((select jsonb_agg(jsonb_build_object(
      'id', i.id, 'inv', i.inv_number, 'date', i.invoice_date, 'customer', c.name, 'total', i.total, 'status', i.status,
      'qbo', case when a.invoice_id is not null then jsonb_build_object('status', a.status, 'total', a.total, 'doc_number', a.doc_number) end,
      'bc', case when b.invoice_id is not null then jsonb_build_object('status', b.status, 'bc_number', b.bc_number, 'bc_total', b.bc_total,
              'app_total', b.app_total, 'note', b.note, 'error', b.error, 'sent_by', b.sent_by, 'sent_at', b.sent_at, 'checked_at', b.checked_at) end)
      order by i.invoice_date desc, i.id desc)
    from invoices i join customers c on c.id = i.customer_id and c.kind = 'external'
    left join acct_pushes a on a.invoice_id = i.id and a.env = acct_env()
    left join bc_pushes b on b.invoice_id = i.id and b.env = p_env
   where i.invoice_date >= s or b.invoice_id is not null), '[]');
end $$;

-- Accounting Admins: settings (p_settings {"auto_push": "true", ...}) and matches (p_map [{"kind","key","value"}], value '' = forget)
create or replace function bc_save(p_settings jsonb default null, p_map jsonb default null) returns void
language plpgsql security definer set search_path = public as $$
declare k text; v text; r jsonb;
begin
  perform no_view_as();
  if not (is_mod_admin('accounting') or is_owner()) then raise exception 'Only an Accounting Admin can change the Business Central settings'; end if;
  for k, v in select * from jsonb_each_text(coalesce(p_settings, '{}')) loop
    if k not in ('auto_push', 'post', 'start_date', 'use_app_numbers', 'class_dims') then raise exception 'Unknown setting %', k; end if;
    if k in ('auto_push', 'post', 'use_app_numbers') and v not in ('true', 'false') then raise exception '% must be true or false', k; end if;
    if k = 'start_date' then perform v::date; end if;
    insert into app_settings (key, value) values ('bc.' || k, coalesce(v, '')) on conflict (key) do update set value = excluded.value;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(p_map, '[]')) loop
    if coalesce(trim(r ->> 'value'), '') = '' then
      delete from bc_map where kind = r ->> 'kind' and key = r ->> 'key';
    else
      insert into bc_map (kind, key, value, updated_by, updated_at) values (r ->> 'kind', r ->> 'key', trim(r ->> 'value'), current_email(), now())
      on conflict (kind, key) do update set value = excluded.value, updated_by = excluded.updated_by, updated_at = now();
    end if;
  end loop;
  insert into events (user_email, type, note, details)
  values (current_email(), 'bc_settings', null, jsonb_build_object('settings', p_settings, 'map', p_map));
end $$;

revoke all on function bc_config(), bc_list(text), bc_save(jsonb, jsonb) from public, anon;
grant execute on function bc_config(), bc_list(text), bc_save(jsonb, jsonb) to authenticated, service_role;

select 'bc settings' as what, string_agg(key || '=' || value, ', ' order by key) as value from app_settings where key like 'bc.%';
