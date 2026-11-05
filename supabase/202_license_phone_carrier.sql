-- 202: phone for questions per license, and outside carriers on their own license (Msg R-205, 11/4).
--  * licenses.metrc_phone: the phone for questions on METRC manifests from that license (Compliance > Settings > METRC through T3).
--    Starts as Aziz's 831-999-0037 on all our licenses. Kept apart from licenses.phone, which prints on documents.
--    Manifest phone: the driver's (Vehicles > Drivers), else their person's (My settings), else the shipping license's, else
--    the default setting, else METRC's default.
--  * A truck that belongs to a carrier with a license # (Vehicles > Carriers) goes on the manifest with that carrier as the
--    transporter (Reefer Trucking: C13-0000140-LIC). No license # on the carrier: our C13, as before. (api/metrc/_xfer.js)
-- Run live by Claude 11/4. Safe to re-run.
begin;
alter table licenses add column if not exists metrc_phone text;
update licenses set metrc_phone = '831-999-0037' where active and metrc_phone is null;

create or replace function set_license_phone(p_license text, p_phone text) returns void
language plpgsql security definer set search_path = public as $$
begin
  perform require_staff();
  perform no_view_as();
  if not (is_owner() or mod_level('compliance') = 'admin') then raise exception 'Only a Compliance Admin can change this'; end if;
  update licenses set metrc_phone = nullif(trim(coalesce(p_phone, '')), '') where license_no = p_license;
  if not found then raise exception 'License % not found', p_license; end if;
end $$;
revoke all on function set_license_phone(text, text) from public, anon;
grant execute on function set_license_phone(text, text) to authenticated;
commit;

select license_no, site, metrc_phone from licenses order by sort;
