-- Fırsat kartlarında kaynak sayfanın paylaşım görselini saklamak için medya alanı ekler.
alter table public.opportunities
  add column if not exists image_url text;
