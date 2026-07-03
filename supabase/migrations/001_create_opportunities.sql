create extension if not exists pgcrypto;

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  unique_key text not null unique,
  title text not null,
  summary text,
  category text not null check (
    category in (
      'Destek Programı',
      'Fon Çağrısı',
      'Yatırım',
      'Hızlandırma',
      'Kuluçka',
      'Etkinlik',
      'Haber',
      'Sosyal Akış'
    )
  ),
  source_name text not null,
  source_url text not null,
  application_url text,
  published_at timestamptz,
  deadline_at timestamptz,
  location text,
  is_featured boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists opportunities_category_idx
  on public.opportunities (category);

create index if not exists opportunities_published_at_idx
  on public.opportunities (published_at desc nulls last);

create index if not exists opportunities_deadline_at_idx
  on public.opportunities (deadline_at asc nulls last);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists opportunities_set_updated_at on public.opportunities;
create trigger opportunities_set_updated_at
before update on public.opportunities
for each row execute function public.set_updated_at();

alter table public.opportunities enable row level security;

drop policy if exists "Opportunities are publicly readable" on public.opportunities;
create policy "Opportunities are publicly readable"
on public.opportunities
for select
to anon, authenticated
using (true);
