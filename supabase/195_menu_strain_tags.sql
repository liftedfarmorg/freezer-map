-- Migration 195: customer portal menu shows each strain's grade (SHO / BHO) and type (S, S/H, H, I/H, I).
-- Customers can't read the strains table, so this hands them just name, aliases, type and default grade.
-- Read only. Safe to re-run. Run after 194.
set client_min_messages = warning;

create or replace function menu_strain_tags()
returns table (strain text, aliases text[], strain_type text, grade text)
language plpgsql stable security definer set search_path = public as $$
begin
  if my_customer() is null and not is_staff() then raise exception 'Not allowed'; end if;
  return query
    select s.name::text, coalesce(s.aliases, '{}')::text[], s.strain_type::text, s.default_grade::text
      from strains s;
end $$;

revoke all on function menu_strain_tags() from public, anon;
grant execute on function menu_strain_tags() to authenticated;
