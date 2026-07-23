-- Aşama 5: sosyal medya kayıtlarının platform ve bağlı teknopark bilgisini saklar.
alter table public.opportunities
  add column if not exists platform text,
  add column if not exists related_technopark text;

alter table public.opportunities
  drop constraint if exists opportunities_platform_check;

alter table public.opportunities
  add constraint opportunities_platform_check check (
    platform is null or platform in ('youtube', 'instagram', 'x', 'linkedin')
  );

create index if not exists opportunities_platform_idx
  on public.opportunities (platform)
  where platform is not null;

create index if not exists opportunities_related_technopark_idx
  on public.opportunities (related_technopark)
  where related_technopark is not null;
