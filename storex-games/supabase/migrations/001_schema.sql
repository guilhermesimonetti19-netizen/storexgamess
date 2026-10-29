-- StoreX Games — esquema (idempotente). Execute no SQL Editor do Supabase, na ordem 001 → 002 → 003.
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- ===== Perfis =====
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) <= 80),
  phone text check (phone is null or char_length(phone) <= 20),
  role text not null default 'customer' check (role in ('customer','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Somente UM administrador por vez (para ter mais, remova este índice conscientemente).
create unique index if not exists profiles_single_admin on public.profiles ((role)) where role = 'admin';
drop trigger if exists trg_profiles_updated on public.profiles;
create trigger trg_profiles_updated before update on public.profiles for each row execute function public.set_updated_at();

-- Impede troca de papel por qualquer um que não seja service_role / dono do banco (SQL Editor).
create or replace function public.protect_profile_role() returns trigger language plpgsql as $$
begin
  if new.role is distinct from old.role
     and coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres','supabase_admin') then
    raise exception 'alteração de papel não permitida';
  end if;
  return new;
end $$;
drop trigger if exists trg_profiles_protect on public.profiles;
create trigger trg_profiles_protect before update on public.profiles for each row execute function public.protect_profile_role();

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, left(nullif(trim(coalesce(new.raw_user_meta_data->>'display_name','')), ''), 80))
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ===== Catálogo =====
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text check (description is null or char_length(description) <= 500),
  image_path text,
  position int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
drop trigger if exists trg_categories_updated on public.categories;
create trigger trg_categories_updated before update on public.categories for each row execute function public.set_updated_at();

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  category_id uuid references public.categories(id) on delete restrict,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 120),
  name text not null check (char_length(name) between 2 and 140),
  short_description text check (short_description is null or char_length(short_description) <= 300),
  long_description text check (long_description is null or char_length(long_description) <= 8000),
  platform text check (platform is null or char_length(platform) <= 60),
  price_cents integer not null check (price_cents > 0 and price_cents <= 100000000),
  promo_price_cents integer check (promo_price_cents is null or (promo_price_cents > 0 and promo_price_cents < price_cents)),
  promo_starts_at timestamptz,
  promo_ends_at timestamptz,
  delivery_type text not null default 'whatsapp_manual' check (delivery_type in ('whatsapp_manual')),
  track_stock boolean not null default false,
  stock integer check (stock is null or stock >= 0),
  max_per_order integer not null default 1 check (max_per_order between 1 and 10),
  requirements text check (requirements is null or char_length(requirements) <= 1000),
  region text check (region is null or char_length(region) <= 100),
  edition text check (edition is null or char_length(edition) <= 100),
  specific_terms text check (specific_terms is null or char_length(specific_terms) <= 2000),
  is_active boolean not null default false,
  is_featured boolean not null default false,
  is_new boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not track_stock or stock is not null)
);
create index if not exists products_category_idx on public.products (category_id) where is_active;
create index if not exists products_name_trgm on public.products using gin (name gin_trgm_ops);
create index if not exists products_created_idx on public.products (created_at desc);
drop trigger if exists trg_products_updated on public.products;
create trigger trg_products_updated before update on public.products for each row execute function public.set_updated_at();

-- Instruções privadas (NUNCA expostas ao catálogo público)
create table if not exists public.product_delivery (
  product_id uuid primary key references public.products(id) on delete cascade,
  instructions text check (instructions is null or char_length(instructions) <= 4000),
  steps text check (steps is null or char_length(steps) <= 2000),
  required_info text check (required_info is null or char_length(required_info) <= 1000),
  eta_text text check (eta_text is null or char_length(eta_text) <= 200),
  notes text check (notes is null or char_length(notes) <= 1000),
  whatsapp_message text check (whatsapp_message is null or char_length(whatsapp_message) <= 500),
  updated_at timestamptz not null default now()
);

create table if not exists public.product_images (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  path text not null unique,
  position int not null default 0,
  mime_type text not null check (mime_type in ('image/png','image/jpeg','image/webp')),
  size_bytes int not null check (size_bytes > 0 and size_bytes <= 2097152),
  created_at timestamptz not null default now()
);
create index if not exists product_images_product_idx on public.product_images (product_id, position);

create table if not exists public.store_settings (
  key text primary key check (key ~ '^[a-z_]{2,40}$'),
  value text not null check (char_length(value) <= 4000),
  updated_at timestamptz not null default now()
);
create table if not exists public.pages (
  slug text primary key check (slug ~ '^[a-z-]{2,40}$'),
  title text not null check (char_length(title) <= 120),
  body text not null default '' check (char_length(body) <= 20000),
  updated_at timestamptz not null default now()
);

-- View do catálogo público (promoção vigente já resolvida). Acesso só via service_role (ver 002).
create or replace view public.catalog_products as
select p.id, p.slug, p.name, p.short_description, p.long_description, p.platform,
       p.category_id, c.slug as category_slug, c.name as category_name,
       p.price_cents,
       case when p.promo_price_cents is not null
             and (p.promo_starts_at is null or p.promo_starts_at <= now())
             and (p.promo_ends_at is null or p.promo_ends_at > now())
            then p.promo_price_cents end as promo_active_cents,
       coalesce(case when p.promo_price_cents is not null
             and (p.promo_starts_at is null or p.promo_starts_at <= now())
             and (p.promo_ends_at is null or p.promo_ends_at > now())
            then p.promo_price_cents end, p.price_cents) as effective_price_cents,
       p.track_stock, p.stock, p.max_per_order, p.requirements, p.region, p.edition, p.specific_terms,
       p.is_featured, p.is_new, p.created_at, (not p.track_stock or p.stock > 0) as in_stock,
       (select pi.path from public.product_images pi where pi.product_id = p.id order by pi.position, pi.created_at limit 1) as image_path
from public.products p
left join public.categories c on c.id = p.category_id
where p.is_active and p.archived_at is null and (c.id is null or c.is_active);

-- ===== Pedidos =====
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  public_ref text not null unique,
  order_nsu text not null unique,
  user_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key text not null check (idempotency_key ~ '^[A-Za-z0-9_-]{8,64}$'),
  status text not null default 'pending' check (status in ('pending','paid','in_delivery','completed','cancelled','expired','refunded')),
  payment_status text not null default 'pending' check (payment_status in ('pending','paid','failed','cancelled','expired','refunded')),
  delivery_status text not null default 'pending' check (delivery_status in ('pending','delivered','needs_review')),
  subtotal_cents integer not null check (subtotal_cents > 0),
  total_cents integer not null check (total_cents > 0),
  currency text not null default 'BRL' check (currency = 'BRL'),
  checkout_url text,
  transaction_nsu text,
  invoice_slug text,
  payment_method text,
  paid_amount_cents integer,
  receipt_url text,
  paid_at timestamptz,
  refunded_at timestamptz,
  delivered_at timestamptz,
  whatsapp_link_opened_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);
create index if not exists orders_user_idx on public.orders (user_id, created_at desc);
create index if not exists orders_pay_idx on public.orders (payment_status, created_at);
create index if not exists orders_paid_at_idx on public.orders (paid_at) where payment_status = 'paid';
create index if not exists orders_created_idx on public.orders (created_at desc);
drop trigger if exists trg_orders_updated on public.orders;
create trigger trg_orders_updated before update on public.orders for each row execute function public.set_updated_at();

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name_snapshot text not null,
  description_snapshot text,
  category_snapshot text,
  platform_snapshot text,
  quantity integer not null check (quantity between 1 and 10),
  unit_price_cents integer not null check (unit_price_cents > 0),
  subtotal_cents integer not null check (subtotal_cents > 0),
  track_stock boolean not null default false,
  delivery_snapshot jsonb,
  created_at timestamptz not null default now()
);
create index if not exists order_items_order_idx on public.order_items (order_id);

create table if not exists public.order_notes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  author_id uuid references auth.users(id) on delete set null,
  note text not null check (char_length(note) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table if not exists public.payment_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid references public.orders(id) on delete set null,
  provider_event_id text not null unique,
  source text not null check (source in ('webhook','verify','reconcile','admin')),
  event_type text not null,
  status_received text,
  validation_result text not null,
  amount_cents integer,
  created_at timestamptz not null default now()
);
create index if not exists payment_events_order_idx on public.payment_events (order_id);
create index if not exists payment_events_created_idx on public.payment_events (created_at desc);

create table if not exists public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  details jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_created_idx on public.audit_log (created_at desc);

-- ===== Dados estruturais (não são demonstração) =====
insert into public.categories (name, slug, description, position) values
 ('Jogos para videogames', 'jogos-videogames', 'Jogos para Xbox e outras plataformas compatíveis com os produtos cadastrados.', 1),
 ('Jogos para PC / Steam', 'jogos-pc-steam', 'Jogos digitais para PC e Steam.', 2),
 ('Packs, assinaturas e serviços digitais', 'packs-assinaturas', 'Packs, assinaturas, ferramentas e outros produtos digitais.', 3)
on conflict (slug) do nothing;

insert into public.store_settings (key, value) values
 ('store_name', 'StoreX Games'),
 ('whatsapp_number', ''),
 ('whatsapp_message', 'Olá! Fiz o pedido #{pedido} na StoreX Games e preciso das instruções para receber meu produto.'),
 ('support_text', 'Atendimento via WhatsApp após a confirmação do pagamento.'),
 ('instagram_url', ''),
 ('alert_pending_hours', '24'),
 ('alert_low_stock', '3')
on conflict (key) do nothing;

insert into public.pages (slug, title, body) values
 ('privacidade', 'Política de Privacidade', E'[MODELO EDITÁVEL — o proprietário deve revisar conforme seu negócio e a LGPD]\n\nResponsável: [NOME/RAZÃO SOCIAL] — CNPJ/CPF: [PREENCHER] — Contato: [E-MAIL]\n\nDados coletados: e-mail, nome de exibição e dados dos pedidos, apenas para cadastro, compra e atendimento.\nPagamentos são processados pela InfinitePay; a loja não armazena dados de cartão.\nSolicitações de acesso, correção ou exclusão: [E-MAIL]. Registros de pedidos podem ser mantidos pelo prazo exigido em lei.'),
 ('termos', 'Termos de Uso e Compra', E'[MODELO EDITÁVEL — revisar com orientação jurídica]\n\nOs produtos são digitais e entregues manualmente via WhatsApp após a confirmação do pagamento.\nCondições específicas de cada produto aparecem na página do produto.'),
 ('entrega', 'Política de Entrega Digital', E'[MODELO EDITÁVEL]\n\nApós a confirmação do pagamento, abra a conversa pelo botão de WhatsApp do pedido. O prazo estimado é: [DEFINIR].'),
 ('reembolso', 'Cancelamento e Reembolso', E'[MODELO EDITÁVEL — definir condições conforme a lei (ex.: CDC) e o tipo de produto]\n\nPedidos pendentes podem ser cancelados antes do pagamento. Regras de reembolso: [DEFINIR].'),
 ('contato', 'Contato e Informações Comerciais', E'[PREENCHER]\n\nRazão social: [ ]\nCNPJ: [ ]\nE-mail: [ ]\nWhatsApp: [ ]')
on conflict (slug) do nothing;

create or replace function public.decrement_stock(p_product uuid, p_qty int) returns void
language sql security definer set search_path = public as $$
  update public.products set stock = greatest(stock - p_qty, 0) where id = p_product and track_stock;
$$;
