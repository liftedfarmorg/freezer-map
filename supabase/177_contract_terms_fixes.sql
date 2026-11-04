-- RUN LIVE 11/3 by Claude in the SQL Editor (Aziz OK). Checked after: Punch NET30; STIIIZY 50,000 lb, 4,167/mo, 50-50-NET30; Jetty 2026 smalls line price $175.
-- 177: contract terms fixes from the check against the signed 2026 agreements (Aziz 11/3, Message 181 answers).
-- Bear Labs stays at 30,000 (increased after signing). SLO Driver and KGJMK stay as they are. No storage fee for contract customers.
-- Motley Terpz has no contract. Ay Papi later. Everyone else stays as it is in the app.
begin;

-- Punch: Net 30 like the agreement (was Net 60)
update customers set payment_terms = 'NET30' where id = 76 and name = 'Punch Edibles and Extracts';

-- STIIIZY: the 30,000 lb option hasn't been taken, so the contract is 50,000 lb, minimum 1/12 a month.
-- Payment 50% COD, rest at the next pickup (max 30 days) -> the existing "50% due now, 50% Net 30" terms.
update customers set contract_lbs = 50000, monthly_min_lbs = 4167, payment_terms = '50-50-NET30' where id = 88 and name = 'STIIIZY';

-- Jetty: 800 dry lb of 2026 smalls at $175/lb (Exhibit A of the amended agreement)
insert into customer_product_prices (customer_id, crop_year, finish, price_per_lb, updated_by)
values (57, 2026, 'SM', 175, 'Claude (Aziz OK 11/3)')
on conflict (customer_id, crop_year, finish) do update set price_per_lb = excluded.price_per_lb, updated_by = excluded.updated_by, updated_at = now();

insert into events (user_email, type, note, details)
values ('aziz@lifted-organics.com', 'contract_terms_fix', '177: Punch Net 30; STIIIZY 50,000 lb / 4,167 a month / 50-50 Net 30; Jetty 2026 smalls $175',
        jsonb_build_object('source', 'signed 2026 agreements, Legal > Crop Contracts'));

do $$ begin
  if (select count(*) from customers where (id = 76 and payment_terms = 'NET30') or (id = 88 and contract_lbs = 50000 and payment_terms = '50-50-NET30')) <> 2
  then raise exception '177: a customer did not update; nothing changed'; end if;
end $$;

commit;
