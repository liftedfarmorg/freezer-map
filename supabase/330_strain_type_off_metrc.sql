-- RUN LIVE 11/10 by Claude in the SQL Editor (checked after: 8 to-dos skipped, kind off, function queues nothing).
-- 330 (Msg MT-3, 11/10): strain type changes stop going to METRC until the official METRC API is set up (Aziz 11/10).
-- T3 has no strain update (every send 404'd, see MT-1). The type lives in the app only; nothing in METRC changes.
--  * set_strain_type: same as 172 minus the METRC to-dos. Still saves metrc_indica/metrc_sativa on the strain,
--    so a strain made in METRC later (new license) goes in with the right split.
--  * strain_update kind: off (not ready) so nothing sends it.
--  * the open "Update strain in METRC" to-dos are closed as skipped with a note.
-- Turning it back on later: add a METRC API sender, re-run the METRC part of 172, set ready + route 'api'.
-- Safe to re-run.
begin;

create or replace function set_strain_type(p_strain int, p_type text) returns void
language plpgsql security definer set search_path = public as $$
declare ind numeric; s strains; was text;
begin
  perform no_view_as();
  if not (is_any_admin() or is_owner()) then raise exception 'Only an Admin can change the strain type'; end if;
  ind := case p_type when 'Indica' then 100 when 'Indica Hybrid' then 75 when 'Hybrid' then 50 when 'Sativa Hybrid' then 25 when 'Sativa' then 0 end;
  if p_type is not null and ind is null then raise exception 'Pick Indica, Indica Hybrid, Hybrid, Sativa Hybrid or Sativa'; end if;
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

update metrc_push_kinds
   set ready = false, mode = 'off', label = 'Strain type change: update the strain in METRC (off until the METRC API is set up)', updated_at = now()
 where kind = 'strain_update';

update comp_metrc_actions
   set status = 'skipped', done_at = now(),
       note = 'Not sent: strain type lives in the app only until the METRC API is set up (T3 can''t update strains)'
 where kind = 'strain_update' and status in ('todo', 'error');

commit;
