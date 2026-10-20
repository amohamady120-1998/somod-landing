-- Synkroniza BD — database schema (idempotent: safe to run again).
-- Run with: psql "$SUPABASE_DB_URL" -f supabase/schema.sql  (the "Setup Supabase" workflow does it for you)

-- ---------- people & roles ----------
create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  name text,
  email text,
  role text not null default 'pending' check (role in ('pending','viewer','bd','manager','admin')),
  created_at timestamptz not null default now()
);

-- First account to sign up becomes admin; everyone after waits for approval.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    case when exists (select 1 from public.profiles) then 'pending' else 'admin' end
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role from public.profiles where id = auth.uid()), 'none')
$$;

alter table public.profiles enable row level security;
drop policy if exists profiles_read on public.profiles;
create policy profiles_read on public.profiles for select
  using (id = auth.uid() or public.my_role() in ('viewer','bd','manager','admin'));
drop policy if exists profiles_admin on public.profiles;
create policy profiles_admin on public.profiles for update
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- ---------- all business data: one document store ----------
create table if not exists public.docs (
  collection text not null,
  id text not null,
  data jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);
create index if not exists docs_collection_idx on public.docs (collection);
alter table public.docs replica identity full;

alter table public.docs enable row level security;
drop policy if exists docs_read on public.docs;
create policy docs_read on public.docs for select
  using (public.my_role() in ('viewer','bd','manager','admin'));
drop policy if exists docs_insert on public.docs;
create policy docs_insert on public.docs for insert
  with check (public.my_role() in ('bd','manager','admin'));
drop policy if exists docs_update on public.docs;
create policy docs_update on public.docs for update
  using (public.my_role() in ('bd','manager','admin'))
  with check (public.my_role() in ('bd','manager','admin'));
drop policy if exists docs_delete on public.docs;
create policy docs_delete on public.docs for delete
  using (public.my_role() in ('bd','manager','admin'));

-- Recursive merge used by "update" (nested objects merge, everything else replaces).
create or replace function public.jsonb_deep_merge(a jsonb, b jsonb) returns jsonb
language sql immutable as $$
  select case
    when jsonb_typeof(a) = 'object' and jsonb_typeof(b) = 'object' then
      coalesce((
        select jsonb_object_agg(
          coalesce(ka, kb),
          case when va is null then vb
               when vb is null then va
               else public.jsonb_deep_merge(va, vb) end)
        from jsonb_each(a) e1(ka, va)
        full join jsonb_each(b) e2(kb, vb) on ka = kb
      ), '{}'::jsonb)
    else b
  end
$$;

create or replace function public.doc_merge(c text, i text, patch jsonb) returns void
language plpgsql security invoker set search_path = public as $$
begin
  update public.docs set data = public.jsonb_deep_merge(data, patch), updated_at = now()
   where collection = c and id = i;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
end $$;

-- ---------- live updates ----------
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'docs') then
    alter publication supabase_realtime add table public.docs;
  end if;
end $$;

-- ---------- files (company files, booklets, CVs) ----------
do $$ begin
  if exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    insert into storage.buckets (id, name, public) values ('files', 'files', false)
    on conflict (id) do nothing;
    drop policy if exists files_read on storage.objects;
    create policy files_read on storage.objects for select
      using (bucket_id = 'files' and public.my_role() in ('viewer','bd','manager','admin'));
    drop policy if exists files_write on storage.objects;
    create policy files_write on storage.objects for insert
      with check (bucket_id = 'files' and public.my_role() in ('bd','manager','admin'));
    drop policy if exists files_delete on storage.objects;
    create policy files_delete on storage.objects for delete
      using (bucket_id = 'files' and public.my_role() in ('bd','manager','admin'));
  end if;
end $$;
