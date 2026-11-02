-- 006 — endurecimento (idempotente). Execute depois de 001–005.

-- 1) Uma transação/fatura da InfinitePay só pode confirmar UM pedido.
create unique index if not exists orders_tx_uniq   on public.orders (transaction_nsu) where transaction_nsu is not null;
create unique index if not exists orders_slug_uniq on public.orders (invoice_slug)    where invoice_slug is not null;

-- 2) Cupom de primeira compra: no máximo um pedido ativo (pendente/pago) com cupom por usuário (fecha a corrida).
create unique index if not exists orders_coupon_once on public.orders (user_id)
  where coupon_code is not null and payment_status in ('pending','paid');

-- 3) Consistência de valores e de pagamento.
do $$ begin
  alter table public.orders add constraint orders_total_consistent
    check (total_cents = subtotal_cents - discount_cents - coupon_cents) not valid;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.orders add constraint orders_paid_has_date
    check (payment_status <> 'paid' or paid_at is not null) not valid;
exception when duplicate_object then null; end $$;

-- 4) Estoque: devolve false quando a venda excede o estoque (o servidor registra o alerta).
drop function if exists public.decrement_stock(uuid, int);
create function public.decrement_stock(p_product uuid, p_qty int) returns boolean
language plpgsql security definer set search_path = public as $$
declare v_ok boolean;
begin
  select stock >= p_qty into v_ok from public.products where id = p_product and track_stock for update;
  if v_ok is null then return true; end if;
  update public.products set stock = greatest(stock - p_qty, 0) where id = p_product;
  return v_ok;
end $$;
revoke all on function public.decrement_stock(uuid, int) from public, anon, authenticated;
grant execute on function public.decrement_stock(uuid, int) to service_role;

-- 5) View do catálogo sob as permissões de quem consulta.
alter view public.catalog_products set (security_invoker = true);
revoke all on public.catalog_products from anon, authenticated, public;
grant select on public.catalog_products to service_role;

-- 6) LGPD: anonimização (preserva o histórico de pedidos). Rode no SQL Editor:
--    select public.anonymize_user('<uuid do usuário>');
create or replace function public.anonymize_user(p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.profiles where id = p_user and role = 'admin') then
    raise exception 'não é permitido anonimizar o administrador';
  end if;
  update public.profiles set display_name = null, phone = null where id = p_user;
  update auth.users set email = 'anon-' || p_user || '@removido.invalid', phone = null,
    raw_user_meta_data = '{}'::jsonb, encrypted_password = '', banned_until = 'infinity' where id = p_user;
  delete from auth.sessions where user_id = p_user;
end $$;
revoke all on function public.anonymize_user(uuid) from public, anon, authenticated;
grant execute on function public.anonymize_user(uuid) to service_role;
