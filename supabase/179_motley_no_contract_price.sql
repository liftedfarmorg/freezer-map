-- RUN LIVE 11/3 by Claude in the SQL Editor (Aziz OK).
-- 179: Motley Terpz has no contract (Aziz 11/3), so clear their $35 contract price. They get the item card / market price like any outside customer.
begin;
update customers set price_per_lb = null where id = 69 and name = 'Motley Terpz';
delete from customer_terms where customer_id = 69;
insert into events (user_email, type, note, details)
values ('aziz@lifted-organics.com', 'contract_terms_fix', '179: Motley Terpz contract price cleared (no contract)', jsonb_build_object('customer', 69, 'was', 35));
do $$ begin
  if exists (select 1 from customers where id = 69 and price_per_lb is not null) then raise exception '179: Motley did not update; nothing changed'; end if;
end $$;
commit;
