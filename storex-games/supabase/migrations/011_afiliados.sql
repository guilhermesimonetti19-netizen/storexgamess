create table if not exists public.affiliates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete restrict,
  email text not null,
  code text not null unique check (code ~ '^[a-z0-9-]{3,30}$'),
  percent numeric(5,2) not null check (percent >= 0.01 and percent <= 90),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
alter table public.affiliates enable row level security;
revoke all on public.affiliates from anon, authenticated, public;
grant all on public.affiliates to service_role;

alter table public.orders add column if not exists affiliate_id uuid references public.affiliates(id) on delete set null;
alter table public.orders add column if not exists affiliate_percent numeric(5,2);
alter table public.orders add column if not exists affiliate_cents integer not null default 0 check (affiliate_cents >= 0);
create index if not exists orders_affiliate_idx on public.orders (affiliate_id, paid_at) where affiliate_id is not null;

create or replace function public.find_user_by_email(p_email text) returns uuid
language sql security definer set search_path = public as $$
  select id from auth.users where lower(email) = lower(p_email) limit 1 $$;
revoke all on function public.find_user_by_email(text) from public, anon, authenticated;
grant execute on function public.find_user_by_email(text) to service_role;