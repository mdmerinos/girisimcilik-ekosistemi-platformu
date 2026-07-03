-- Ingestion kaynak durumlarını ayrıntılı ve kullanıcı dostu sağlık durumlarıyla genişletir.
do $$
declare
  status_constraint record;
begin
  for status_constraint in
    select conname
    from pg_constraint
    where conrelid = 'public.ingestion_logs'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%status%'
  loop
    execute format(
      'alter table public.ingestion_logs drop constraint %I',
      status_constraint.conname
    );
  end loop;
end
$$;

alter table public.ingestion_logs
  add constraint ingestion_logs_status_check check (
    status in (
      'success',
      'partial',
      'empty',
      'skipped',
      'fragile',
      'error'
    )
  );
