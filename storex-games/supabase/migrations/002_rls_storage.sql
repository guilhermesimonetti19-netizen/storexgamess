-- Segurança: RLS em TODAS as tabelas, sem nenhuma política para anon/authenticated (negação total).
-- Toda leitura/escrita de dados passa pelo servidor (service_role), que valida usuário, papel e preços.
alter table public.profiles        enable row level security;
alter table public.categories      enable row level security;
alter table public.products        enable row level security;
alter table public.product_delivery enable row level security;
alter table public.product_images  enable row level security;
alter table public.store_settings  enable row level security;
alter table public.pages           enable row level security;
alter table public.orders          enable row level security;
alter table public.order_items     enable row level security;
alter table public.order_notes     enable row level security;
alter table public.payment_events  enable row level security;
alter table public.audit_log       enable row level security;

-- Remove privilégios herdados por padrão (view e funções ignoram RLS, então revogamos explicitamente).
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated, public;
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated, public;
grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- Storage: bucket público apenas para LEITURA por URL; sem políticas de escrita
-- (uploads só pelo servidor com service_role, que valida tipo/tamanho/admin).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 2097152, array['image/png','image/jpeg','image/webp'])
on conflict (id) do update set public = true, file_size_limit = 2097152,
  allowed_mime_types = array['image/png','image/jpeg','image/webp'];
