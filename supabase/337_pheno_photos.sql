-- Migration 337: photos on each pheno in the pheno hunt (Msg PHENO-PIC-1, Aziz 11/11).
-- Anyone with Nursery access can snap or upload as many photos as they want per pheno (the plant, the jar test, buds),
-- everyone with Nursery access sees them, each photo shows who took it. You can delete your own; a Nursery Admin can delete any.
-- Photos go in their own private storage bucket "nursery" (not the Compliance bucket, so scorers don't need Compliance access).
-- App only, nothing to METRC. Safe to re-run. Run after 336.
set client_min_messages = warning;

-- ---------- private bucket ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('nursery', 'nursery', false, 26214400, array['image/jpeg','image/png','image/webp','image/heic','image/heif','image/gif'])
on conflict (id) do update set public = false;

drop policy if exists nursery_files_read on storage.objects;
create policy nursery_files_read on storage.objects for select to authenticated
  using (bucket_id = 'nursery' and (public.has_module('nursery') or public.is_admin()));
drop policy if exists nursery_files_add on storage.objects;
create policy nursery_files_add on storage.objects for insert to authenticated
  with check (bucket_id = 'nursery' and name like 'pheno/%' and public.has_module('nursery') and not public.impersonating());
drop policy if exists nursery_files_delete on storage.objects;
create policy nursery_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'nursery' and (owner = auth.uid() or public.is_mod_admin('nursery') or public.is_admin()) and not public.impersonating());

-- ---------- one row per photo ----------
create table if not exists pheno_photos (
  id          bigserial primary key,
  pheno_id    bigint not null references phenos(id) on delete cascade,
  file_path   text not null unique,              -- path in the nursery bucket
  kind        text not null default 'plant' check (kind in ('plant','jar','bud','other')),
  caption     text,
  taken_by    text not null default current_email(),
  created_at  timestamptz not null default now()
);
create index if not exists pheno_photos_pheno on pheno_photos (pheno_id, created_at);
alter table pheno_photos enable row level security;
drop policy if exists n_read on pheno_photos; drop policy if exists n_add on pheno_photos;
drop policy if exists n_edit on pheno_photos; drop policy if exists n_delete on pheno_photos;
create policy n_read on pheno_photos for select to authenticated using (has_module('nursery') or is_admin());
create policy n_add on pheno_photos for insert to authenticated with check (has_module('nursery') and taken_by = current_email() and not impersonating());
create policy n_edit on pheno_photos for update to authenticated using (taken_by = current_email() or is_mod_admin('nursery'))
  with check (not impersonating());
create policy n_delete on pheno_photos for delete to authenticated using ((taken_by = current_email() or is_mod_admin('nursery') or is_admin()) and not impersonating());
revoke all on pheno_photos from anon;
grant select, insert, update, delete on pheno_photos to authenticated;
grant usage, select on sequence pheno_photos_id_seq to authenticated;
grant all on pheno_photos to service_role;

select 'pheno photos ready' as done, (select count(*) from storage.buckets where id = 'nursery') as bucket;
