-- 324: Customer portal "Help & feedback": customers send a note (something not working, a question, an idea) and
-- Sales sees them in Sales > Customer feedback. Not a ticket system: no status to open or close, just a running list.
-- Safe to re-run.

create table if not exists portal_feedback (
  id          bigserial primary key,
  customer_id int references customers(id) on delete set null,
  user_email  text,
  user_name   text,
  kind        text not null default 'problem' check (kind in ('problem', 'question', 'idea')),
  message     text not null check (length(trim(message)) > 0),
  screen      text,          -- which portal screen they were on
  device      text,          -- phone / desktop and the browser, to help reproduce problems
  created_at  timestamptz not null default now()
);
create index if not exists portal_feedback_created on portal_feedback (created_at desc);
alter table portal_feedback enable row level security;   -- no direct access; the two functions below

-- a signed-in customer sends a note; who and which customer come from their login, not from the page
create or replace function send_portal_feedback(p_kind text, p_message text, p_screen text default null, p_device text default null)
returns bigint
language plpgsql security definer set search_path = public as $$
declare cid int := my_customer(); e text := jwt_email(); u app_users; v bigint;
begin
  if cid is null then raise exception 'Only customer logins can send portal feedback'; end if;
  if coalesce(length(trim(p_message)), 0) = 0 then raise exception 'Write a message first'; end if;
  if length(p_message) > 5000 then raise exception 'That message is too long (5,000 characters max)'; end if;
  select * into u from app_users where email = e;
  insert into portal_feedback (customer_id, user_email, user_name, kind, message, screen, device)
  values (cid, e, u.display_name, coalesce(nullif(p_kind, ''), 'problem'), trim(p_message), left(p_screen, 80), left(p_device, 200))
  returning id into v;
  return v;
end $$;

-- Sales (and admins/owners) read the list, newest first
create or replace function list_portal_feedback(p_limit int default 500)
returns table (id bigint, created_at timestamptz, customer_id int, customer text, user_email text, user_name text, kind text, message text, screen text, device text)
language sql stable security definer set search_path = public as $$
  select f.id, f.created_at, f.customer_id, c.name, f.user_email, f.user_name, f.kind, f.message, f.screen, f.device
    from portal_feedback f left join customers c on c.id = f.customer_id
   where is_sales() or is_admin()
   order by f.created_at desc
   limit greatest(1, least(coalesce(p_limit, 500), 2000))
$$;

revoke execute on function send_portal_feedback(text, text, text, text) from public, anon;
grant execute on function send_portal_feedback(text, text, text, text) to authenticated;
revoke execute on function list_portal_feedback(int) from public, anon;
grant execute on function list_portal_feedback(int) to authenticated;

select 'ok' as result;
