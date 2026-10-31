alter table public.products add column if not exists xbox_versions text[] not null default '{}';
alter table public.orders add column if not exists coupon_code text;
alter table public.orders add column if not exists coupon_cents integer not null default 0 check (coupon_cents >= 0);

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
       (select pi.path from public.product_images pi where pi.product_id = p.id order by pi.position, pi.created_at limit 1) as image_path,
       p.xbox_versions
from public.products p
left join public.categories c on c.id = p.category_id
where p.is_active and p.archived_at is null and (c.id is null or c.is_active);

-- a view foi recriada: reaplica as permissões (somente service_role)
revoke all on public.catalog_products from anon, authenticated, public;
grant select on public.catalog_products to service_role;