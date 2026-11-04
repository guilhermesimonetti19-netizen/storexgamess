create table if not exists public.analytics_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  event_type text not null check (event_type in ('page_view','product_view','add_to_cart','checkout_start','search')),
  session_id text not null check (session_id ~ '^[a-f0-9]{16,40}$'),
  path text check (path is null or char_length(path) <= 120),
  product_id uuid references public.products(id) on delete set null,
  term text check (term is null or char_length(term) <= 40),
  referrer text check (referrer is null or char_length(referrer) <= 80),
  device text check (device in ('mobile','tablet','desktop'))
);
create index if not exists analytics_created_idx on public.analytics_events (created_at desc);
create index if not exists analytics_type_idx on public.analytics_events (event_type, created_at);
create index if not exists analytics_product_idx on public.analytics_events (product_id, event_type) where product_id is not null;
alter table public.analytics_events enable row level security;
revoke all on public.analytics_events from anon, authenticated, public;
grant all on public.analytics_events to service_role;

create or replace function public.admin_analytics(p_from timestamptz, p_to timestamptz, p_tz text default 'America/Sao_Paulo', p_bucket text default 'day')
returns jsonb language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  if p_bucket not in ('day','week','month') then raise exception 'bucket inválido'; end if;
  with e as (select * from analytics_events where created_at >= p_from and created_at < p_to)
  select jsonb_build_object(
   'totals', (select jsonb_build_object(
      'pageviews', count(*) filter (where event_type='page_view'),
      'sessions', count(distinct session_id),
      'product_views', count(*) filter (where event_type='product_view'),
      'add_to_cart', count(*) filter (where event_type='add_to_cart'),
      'checkout_start', count(*) filter (where event_type='checkout_start'),
      'searches', count(*) filter (where event_type='search')) from e),
   'funnel', (select jsonb_build_object(
      'sessions', count(distinct session_id),
      'product_view', count(distinct session_id) filter (where event_type='product_view'),
      'add_to_cart', count(distinct session_id) filter (where event_type='add_to_cart'),
      'checkout_start', count(distinct session_id) filter (where event_type='checkout_start'),
      'paid_orders', (select count(*) from orders where payment_status='paid' and paid_at >= p_from and paid_at < p_to)) from e),
   'series', (select coalesce(jsonb_agg(to_jsonb(x) order by x.d),'[]'::jsonb) from (
      select to_char(date_trunc(p_bucket, created_at at time zone p_tz),'YYYY-MM-DD') d,
             count(*) filter (where event_type='page_view') pageviews, count(distinct session_id) sessions from e group by 1) x),
   'top_pages', (select coalesce(jsonb_agg(to_jsonb(x) order by x.n desc),'[]'::jsonb) from (
      select path, count(*) n from e where event_type='page_view' and path is not null group by path order by n desc limit 15) x),
   'products', (select coalesce(jsonb_agg(to_jsonb(x) order by x.views desc, x.carts desc),'[]'::jsonb) from (
      select p.id, p.name, count(*) filter (where e.event_type='product_view') views, count(*) filter (where e.event_type='add_to_cart') carts,
        coalesce((select sum(oi.quantity) from order_items oi join orders o on o.id=oi.order_id where oi.product_id=p.id and o.payment_status='paid' and o.paid_at >= p_from and o.paid_at < p_to),0)::bigint sold
      from e join products p on p.id = e.product_id group by p.id, p.name order by views desc, carts desc limit 30) x),
   'referrers', (select coalesce(jsonb_agg(to_jsonb(x) order by x.n desc),'[]'::jsonb) from (
      select referrer, count(distinct session_id) n from e where event_type='page_view' and referrer is not null group by referrer order by n desc limit 10) x),
   'devices', (select coalesce(jsonb_agg(to_jsonb(x) order by x.n desc),'[]'::jsonb) from (
      select coalesce(device,'desktop') device, count(distinct session_id) n from e group by 1) x),
   'searches', (select coalesce(jsonb_agg(to_jsonb(x) order by x.n desc),'[]'::jsonb) from (
      select term, count(*) n from e where event_type='search' and term is not null group by term order by n desc limit 15) x),
   'hours', (select coalesce(jsonb_agg(to_jsonb(x) order by x.h),'[]'::jsonb) from (
      select extract(hour from created_at at time zone p_tz)::int h, count(*) n from e where event_type='page_view' group by 1) x)
  ) into r;
  return r;
end $$;
revoke all on function public.admin_analytics(timestamptz,timestamptz,text,text) from public, anon, authenticated;
grant execute on function public.admin_analytics(timestamptz,timestamptz,text,text) to service_role;

-- Retenção (LGPD/minimização): select public.purge_analytics(180);
create or replace function public.purge_analytics(p_days int default 180) returns bigint language sql security definer set search_path = public as $$
  with d as (delete from analytics_events where created_at < now() - make_interval(days => p_days) returning 1) select count(*) from d $$;
revoke all on function public.purge_analytics(int) from public, anon, authenticated;
grant execute on function public.purge_analytics(int) to service_role;