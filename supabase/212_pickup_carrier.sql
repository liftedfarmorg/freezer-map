-- 212: customer pickups fill in from Vehicles › Carriers (Msg #233, Aziz 11/5).
--  * customers.pickup_carrier_id: the carrier that picks up for this customer (e.g. Frozen California → Westside Caregivers).
--  * pickup_carriers(): active carriers with their transport license, active drivers (name, DL #) and active trucks (make, model, plate)
--    for the dropdowns on a P- pickup load.
--  * create_pickup: with a pickup carrier set, the transporter license is the carrier's; one active driver / one active truck
--    fill in on their own. Everything can still be typed over on the load (set_pickup_driver) until Picked up.
-- Nothing in METRC changes: these are the same fields Picked up already puts on the manifest. Safe to re-run. Run after 211.
set client_min_messages = warning;

alter table customers add column if not exists pickup_carrier_id int references fleet_carriers(id) on delete set null;

create or replace function pickup_carriers() returns jsonb
language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', k.id, 'name', k.name, 'license_no', k.license_no,
           'drivers', coalesce((select jsonb_agg(jsonb_build_object('name', d.name, 'license_no', d.license_no) order by d.name)
                                  from fleet_drivers d where d.carrier_id = k.id and d.active), '[]'::jsonb),
           'trucks', coalesce((select jsonb_agg(jsonb_build_object('name', a.name, 'make', a.make, 'model', a.model, 'plate', a.plate) order by a.name)
                                 from fleet_assets a where a.carrier_id = k.id and a.status = 'active'), '[]'::jsonb)
         ) order by k.name), '[]'::jsonb)
    from fleet_carriers k
   where k.active and is_staff()
$$;
revoke all on function pickup_carriers() from public, anon;
grant execute on function pickup_carriers() to authenticated;

create or replace function create_pickup(p_customer int, p_date date, p_notes text default null) returns loads
language plpgsql security definer set search_path = public as $$
declare l loads; c customers; k fleet_carriers; dn text; dl text; tk fleet_assets;
begin
  perform require_staff();
  perform no_view_as();
  select * into c from customers where id = p_customer;
  if c.id is null then raise exception 'Pick the customer'; end if;
  l := create_load(pickup_vehicle(), p_date, jsonb_build_array(jsonb_build_object('customer_id', c.id)), null, p_notes);
  update loads set kind = 'pickup', code = replace(code, 'L-', 'P-'), pickup_license = c.license where id = l.id returning * into l;
  if c.pickup_carrier_id is not null then
    select * into k from fleet_carriers where id = c.pickup_carrier_id;
    if (select count(*) from fleet_drivers where carrier_id = k.id and active) = 1 then
      select name, license_no into dn, dl from fleet_drivers where carrier_id = k.id and active;
    end if;
    if (select count(*) from fleet_assets where carrier_id = k.id and status = 'active') = 1 then
      select * into tk from fleet_assets where carrier_id = k.id and status = 'active';
    end if;
    update loads set pickup_license = coalesce(nullif(upper(trim(k.license_no)), ''), pickup_license),
                     pickup_driver = coalesce(dn, pickup_driver), driver = coalesce(dn, driver), pickup_dl = coalesce(dl, pickup_dl),
                     pickup_make = coalesce(tk.make, pickup_make), pickup_model = coalesce(tk.model, pickup_model),
                     pickup_plate = coalesce(nullif(upper(trim(tk.plate)), ''), pickup_plate)
     where id = l.id returning * into l;
  end if;
  return l;
end $$;

select 'ok 212' as done,
  (select json_agg(json_build_object('id', id, 'name', name, 'license', license_no)) from fleet_carriers where name ilike '%westside%' or name ilike '%caregiver%') westside,
  (select json_agg(json_build_object('id', id, 'name', name, 'license', license)) from customers where name ilike '%frozen cal%') frozen_ca;
