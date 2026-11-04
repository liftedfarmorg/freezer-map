-- RUN LIVE 11/3 by Claude in the SQL Editor (Aziz OK).
-- 178: Punch back to Net 60 (Aziz 11/3; undoes the Punch line in 177).
begin;
update customers set payment_terms = 'NET60' where id = 76 and name = 'Punch Edibles and Extracts';
insert into events (user_email, type, note, details)
values ('aziz@lifted-organics.com', 'contract_terms_fix', '178: Punch back to Net 60', jsonb_build_object('customer', 76));
do $$ begin
  if not exists (select 1 from customers where id = 76 and payment_terms = 'NET60') then raise exception '178: Punch did not update; nothing changed'; end if;
end $$;
commit;
