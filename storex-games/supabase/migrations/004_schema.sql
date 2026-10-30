alter table public.orders add column if not exists discount_cents integer not null default 0 check (discount_cents >= 0);
alter table public.orders add column if not exists combo_snapshot jsonb;
insert into public.store_settings (key, value) values
 ('combo_enabled','1'),('combo_qty','2'),('combo_unit_cents','3000'),('combo_price_cents','4500')
on conflict (key) do nothing;