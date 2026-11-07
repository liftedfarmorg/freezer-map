-- 296 (restyle-preview, Msg 296): customer product categories, strain lineage and nurseries, and the two pick lists.
-- RUN LIVE 11/6 by Claude in the SQL Editor (Aziz OK, Msg 297). Safe to re-run.
begin;
alter table customers add column if not exists product_categories text[] not null default '{}';
alter table strains add column if not exists lineage text;
alter table strains add column if not exists nurseries text[] not null default '{}';

insert into app_settings (key, value) values
  ('sales.product_categories', '["Fresh Frozen","Standards","Trim","Smalls","Hash","Rosin","Liquid Live Resin","Distillate"]'),
  ('grow.nurseries', '["1PN","Refined Genetics","Haze Valley Nursery"]')
on conflict (key) do nothing;

-- save one of the pick lists: Sales admins for product categories, Cultivation or Nursery admins for nurseries (Owners and Admins always)
create or replace function set_list_setting(p_key text, p_items jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare was text;
begin
  perform no_view_as();
  if p_key not in ('sales.product_categories', 'grow.nurseries') then raise exception 'Unknown list %', p_key; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'A list is needed'; end if;
  if not (is_owner() or is_admin()
          or (p_key = 'sales.product_categories' and mod_level('sales') = 'admin')
          or (p_key = 'grow.nurseries' and (mod_level('cultivation') = 'admin' or mod_level('nursery') = 'admin'))) then
    raise exception 'Only an admin of that module can change this list';
  end if;
  select value into was from app_settings where key = p_key;
  insert into app_settings (key, value) values (p_key, p_items::text) on conflict (key) do update set value = excluded.value;
  insert into events (user_email, type, note, details)
  values (current_email(), 'app_setting', p_key, jsonb_build_object('key', p_key, 'value', p_items, 'was', was));
end $$;
revoke all on function set_list_setting(text, jsonb) from public, anon;
grant execute on function set_list_setting(text, jsonb) to authenticated;

commit;
