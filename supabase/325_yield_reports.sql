-- 325: Yield reports. Customers report how the fresh frozen they bought ran (hash, rosin, BHO) from the portal's Yields
-- screens; Sales sees every report in Sales > Reported Yields.
--   * one report per shipped order; `lines` is the report as the portal sends it:
--       [{ s: strain, y: crop year, shipped: lbs, note, issue: { kinds: [...], text } | null,
--          parts: [{ bho, rosin, ff (lbs run), outV, outU ('g'|'kg'|'lb'|'%'), rosinV, rosinU ('g'|'kg'|'lb'|'%'|'%ff') }] }]
--     ('%' on the hash/BHO amount = % of fresh frozen; '%' on rosin = % of hash, '%ff' = % of fresh frozen)
--   * saved_at = last save (draft or sent); sent_at = when it was last sent to Lifted (null = draft)
--   * orders shipped on or after yield_reports_from() can be reported (older ones would swamp customers with "to report")
-- Safe to re-run.

create or replace function yield_reports_from() returns date language sql immutable as $$ select date '2026-09-01' $$;

create table if not exists yield_reports (
  order_id    int primary key references orders(id) on delete cascade,
  customer_id int not null references customers(id),
  lines       jsonb not null default '[]' check (jsonb_typeof(lines) = 'array'),
  saved_at    timestamptz not null default now(),
  sent_at     timestamptz,
  saved_by    text,
  sent_by     text,
  created_at  timestamptz not null default now()
);
create index if not exists yield_reports_customer on yield_reports (customer_id);
alter table yield_reports enable row level security;   -- no direct access; the functions below

-- the customer's own reports (portal)
create or replace function my_yields() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('orderId', y.order_id, 'lines', y.lines, 'sentAt', y.sent_at, 'savedAt', y.saved_at) order by y.order_id), '[]'::jsonb)
    from yield_reports y where y.customer_id = my_customer()
$$;

-- the customer saves a draft (p_send = false) or sends it to Lifted (p_send = true); who and which customer come from the login
create or replace function save_yields(p_order_id int, p_lines jsonb, p_send boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare cid int := my_customer(); e text := jwt_email(); o orders;
begin
  if cid is null then raise exception 'Only customer logins can report yields'; end if;
  select * into o from orders where id = p_order_id;
  if o.id is null or o.customer_id <> cid then raise exception 'That order isn''t yours'; end if;
  if o.status <> 'shipped' then raise exception 'Yields can be reported once the order ships'; end if;
  if coalesce(jsonb_typeof(p_lines), '') <> 'array' then raise exception 'Nothing to save'; end if;
  if length(p_lines::text) > 200000 then raise exception 'That report is too big'; end if;
  insert into yield_reports (order_id, customer_id, lines, saved_at, saved_by, sent_at, sent_by)
  values (p_order_id, cid, p_lines, now(), e, case when p_send then now() end, case when p_send then e end)
  on conflict (order_id) do update set lines = excluded.lines, saved_at = now(), saved_by = e,
    sent_at = case when p_send then now() else yield_reports.sent_at end,
    sent_by = case when p_send then e else yield_reports.sent_by end;
  return jsonb_build_object('orderId', p_order_id, 'sentAt', (select sent_at from yield_reports where order_id = p_order_id));
end $$;

-- Sales > Reported Yields: every report, with the customer, the order's label (invoice # if there is one) and ship date
create or replace function list_yield_reports() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'orderId', y.order_id, 'customerId', y.customer_id, 'customer', c.name,
      'label', coalesce((select i.inv_number from invoices i where i.order_id = o.id and i.status <> 'void' order by i.id desc limit 1), o.so_number, 'Order ' || o.id),
      'shippedOn', coalesce(o.shipped_date, o.order_date), 'by', coalesce(y.sent_by, y.saved_by),
      'sentAt', y.sent_at, 'savedAt', y.saved_at, 'lines', y.lines) order by o.shipped_date desc nulls last), '[]'::jsonb)
    from yield_reports y join orders o on o.id = y.order_id join customers c on c.id = y.customer_id
   where is_sales() or is_admin()
$$;

-- shipped orders (since yield_reports_from()) that haven't been sent in yet
create or replace function list_yield_owed() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
      'orderId', o.id, 'customerId', o.customer_id, 'customer', c.name,
      'label', coalesce((select i.inv_number from invoices i where i.order_id = o.id and i.status <> 'void' order by i.id desc limit 1), o.so_number, 'Order ' || o.id),
      'shippedOn', coalesce(o.shipped_date, o.order_date),
      'strains', (select count(distinct (l.strain, l.crop_year)) from order_lines l where l.order_id = o.id)) order by o.shipped_date desc), '[]'::jsonb)
    from orders o join customers c on c.id = o.customer_id
   where (is_sales() or is_admin())
     and o.status = 'shipped' and coalesce(o.shipped_date, o.order_date) >= yield_reports_from()
     and exists (select 1 from order_lines l where l.order_id = o.id)
     and not exists (select 1 from yield_reports y where y.order_id = o.id and y.sent_at is not null)
$$;

revoke all on function my_yields() from public, anon;
revoke all on function save_yields(int, jsonb, boolean) from public, anon;
revoke all on function list_yield_reports() from public, anon;
revoke all on function list_yield_owed() from public, anon;
grant execute on function my_yields() to authenticated;
grant execute on function save_yields(int, jsonb, boolean) to authenticated;
grant execute on function list_yield_reports() to authenticated;
grant execute on function list_yield_owed() to authenticated;
grant execute on function yield_reports_from() to authenticated;

select 'ok' as result;
