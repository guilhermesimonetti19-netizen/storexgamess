-- Dashboard: cálculo no banco. Execução restrita a service_role (a API valida que o usuário é admin).
create or replace function public.admin_dashboard(
  p_from timestamptz, p_to timestamptz, p_tz text default 'America/Sao_Paulo',
  p_bucket text default 'day', p_pending_hours int default 24, p_low_stock int default 3)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_pf timestamptz := p_from - (p_to - p_from); r jsonb;
begin
  if p_bucket not in ('day','week','month') then raise exception 'bucket inválido'; end if;
  select jsonb_build_object(
   'period', jsonb_build_object('from', p_from, 'to', p_to, 'tz', p_tz, 'bucket', p_bucket),
   'kpis', (select jsonb_build_object(
      'gross_cents',        coalesce(sum(total_cents) filter (where payment_status='paid' and paid_at >= p_from and paid_at < p_to),0),
      'gross_prev_cents',   coalesce(sum(total_cents) filter (where payment_status='paid' and paid_at >= v_pf and paid_at < p_from),0),
      'paid_orders',        count(*) filter (where payment_status='paid' and paid_at >= p_from and paid_at < p_to),
      'paid_orders_prev',   count(*) filter (where payment_status='paid' and paid_at >= v_pf and paid_at < p_from),
      'refunded_cents',     coalesce(sum(total_cents) filter (where payment_status='refunded' and refunded_at >= p_from and refunded_at < p_to),0),
      'refunded_orders',    count(*) filter (where payment_status='refunded' and refunded_at >= p_from and refunded_at < p_to),
      'orders_created',     count(*) filter (where created_at >= p_from and created_at < p_to),
      'orders_created_prev',count(*) filter (where created_at >= v_pf and created_at < p_from),
      'sales_today_cents',  coalesce(sum(total_cents) filter (where payment_status='paid' and paid_at >= date_trunc('day', now() at time zone p_tz) at time zone p_tz),0),
      'sales_7d_cents',     coalesce(sum(total_cents) filter (where payment_status='paid' and paid_at >= now() - interval '7 days'),0),
      'sales_30d_cents',    coalesce(sum(total_cents) filter (where payment_status='paid' and paid_at >= now() - interval '30 days'),0)
    ) from orders),
   'orders_by_status', (select coalesce(jsonb_agg(jsonb_build_object('status', status, 'count', n) order by status),'[]'::jsonb)
      from (select status, count(*) n from orders where created_at >= p_from and created_at < p_to group by status) s),
   'revenue_series', (select coalesce(jsonb_agg(to_jsonb(x) order by x.d),'[]'::jsonb) from (
      select to_char(date_trunc(p_bucket, paid_at at time zone p_tz),'YYYY-MM-DD') as d, sum(total_cents)::bigint as cents, count(*) as orders
      from orders where payment_status='paid' and paid_at >= p_from and paid_at < p_to group by 1) x),
   'by_category', (select coalesce(jsonb_agg(to_jsonb(x) order by x.cents desc),'[]'::jsonb) from (
      select coalesce(oi.category_snapshot,'Sem categoria') as category, sum(oi.subtotal_cents)::bigint as cents, sum(oi.quantity)::bigint as qty
      from order_items oi join orders o on o.id = oi.order_id
      where o.payment_status='paid' and o.paid_at >= p_from and o.paid_at < p_to group by 1) x),
   'top_products', (select coalesce(jsonb_agg(to_jsonb(x) order by x.cents desc),'[]'::jsonb) from (
      select oi.name_snapshot as name, sum(oi.quantity)::bigint as qty, sum(oi.subtotal_cents)::bigint as cents
      from order_items oi join orders o on o.id = oi.order_id
      where o.payment_status='paid' and o.paid_at >= p_from and o.paid_at < p_to
      group by oi.name_snapshot order by sum(oi.subtotal_cents) desc limit 10) x),
   'customers', (select jsonb_build_object(
      'total', count(*) filter (where role='customer'),
      'new', count(*) filter (where role='customer' and created_at >= p_from and created_at < p_to),
      'buyers', (select count(distinct user_id) from orders where payment_status='paid')) from profiles),
   'customers_series', (select coalesce(jsonb_agg(to_jsonb(x) order by x.d),'[]'::jsonb) from (
      select to_char(date_trunc(p_bucket, created_at at time zone p_tz),'YYYY-MM-DD') as d, count(*) as n
      from profiles where role='customer' and created_at >= p_from and created_at < p_to group by 1) x),
   'products', (select jsonb_build_object(
      'active', count(*) filter (where is_active and archived_at is null),
      'inactive', count(*) filter (where not is_active and archived_at is null),
      'featured', count(*) filter (where is_featured and is_active and archived_at is null),
      'low_stock', count(*) filter (where track_stock and is_active and stock > 0 and stock <= p_low_stock),
      'out_of_stock', count(*) filter (where track_stock and is_active and stock = 0),
      'no_image', count(*) filter (where is_active and archived_at is null and not exists (select 1 from product_images pi where pi.product_id = products.id))
    ) from products),
   'attention', jsonb_build_object(
      'pending_old', (select count(*) from orders where payment_status='pending' and created_at < now() - make_interval(hours => p_pending_hours)),
      'paid_undelivered', (select count(*) from orders where payment_status='paid' and delivery_status='pending'),
      'needs_whatsapp', (select count(*) from orders where payment_status='paid' and delivery_status='pending' and whatsapp_link_opened_at is not null),
      'needs_review', (select count(*) from orders where delivery_status='needs_review'),
      'payment_errors_7d', (select count(*) from payment_events where created_at >= now() - interval '7 days' and (validation_result like 'error%' or validation_result like 'rejected%'))),
   'recent_events_by_result', (select coalesce(jsonb_agg(jsonb_build_object('result', validation_result, 'count', n)),'[]'::jsonb)
      from (select validation_result, count(*) n from payment_events where created_at >= p_from and created_at < p_to group by 1) e)
  ) into r;
  return r;
end $$;
revoke all on function public.admin_dashboard(timestamptz,timestamptz,text,text,int,int) from public, anon, authenticated;
grant execute on function public.admin_dashboard(timestamptz,timestamptz,text,text,int,int) to service_role;
