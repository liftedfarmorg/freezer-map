-- RUN LIVE 11/10 by Claude in the SQL Editor.
-- 331 (Msg TYPE-AUTO-1, 11/10): new strain type "Autoflower" (Aziz 11/10).
-- Autoflower isn't on the indica / sativa scale, so picking it keeps the strain's indica / sativa % as it was.
-- Strain type stays in the app only (330), nothing goes to METRC.
-- Safe to re-run.
begin;

alter table strains drop constraint if exists strains_strain_type_check;
alter table strains add constraint strains_strain_type_check
  check (strain_type in ('Indica', 'Indica Hybrid', 'Hybrid', 'Sativa Hybrid', 'Sativa', 'Autoflower'));

create or replace function set_strain_type(p_strain int, p_type text) returns void
language plpgsql security definer set search_path = public as $$
declare ind numeric; s strains; was text;
begin
  perform no_view_as();
  if not (is_any_admin() or is_owner()) then raise exception 'Only an Admin can change the strain type'; end if;
  if p_type is not null and p_type not in ('Indica', 'Indica Hybrid', 'Hybrid', 'Sativa Hybrid', 'Sativa', 'Autoflower') then
    raise exception 'Pick Indica, Indica Hybrid, Hybrid, Sativa Hybrid, Sativa or Autoflower'; end if;
  ind := case p_type when 'Indica' then 100 when 'Indica Hybrid' then 75 when 'Hybrid' then 50 when 'Sativa Hybrid' then 25 when 'Sativa' then 0 end;
  select strain_type into was from strains where id = p_strain;
  update strains set strain_type = p_type,
         metrc_indica = coalesce(ind, metrc_indica), metrc_sativa = coalesce(100 - ind, metrc_sativa), updated_at = now()
   where id = p_strain returning * into s;
  insert into events (user_email, type, note, details)
  values (current_email(), 'strain_type', s.name, jsonb_build_object('type', p_type, 'was', was, 'indica', ind));
  -- no METRC to-do: strain type stays in the app until the METRC API route is built (330)
end $$;
revoke all on function set_strain_type(int, text) from public, anon;
grant execute on function set_strain_type(int, text) to authenticated;

commit;
