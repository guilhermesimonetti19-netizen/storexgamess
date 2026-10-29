-- Testes de RLS/permissões — EXECUTE no SQL Editor do Supabase (não foi possível rodar no ambiente de desenvolvimento).
-- Cada bloco deve terminar com NOTICE "OK". Qualquer EXCEPTION = falha.
do $$ begin
  set local role anon;
  begin perform 1 from public.products limit 1; raise exception 'FALHA: anon leu products'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.catalog_products limit 1; raise exception 'FALHA: anon leu a view'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.orders limit 1; raise exception 'FALHA: anon leu orders'; exception when insufficient_privilege then null; end;
  begin perform public.admin_dashboard(now()-interval '1 day', now()); raise exception 'FALHA: anon executou dashboard'; exception when insufficient_privilege then null; end;
  reset role; raise notice 'OK anon';
end $$;
do $$ begin
  set local role authenticated;
  begin perform 1 from public.profiles limit 1; raise exception 'FALHA: authenticated leu profiles'; exception when insufficient_privilege then null; end;
  begin update public.profiles set role = 'admin'; raise exception 'FALHA: authenticated alterou role'; exception when insufficient_privilege then null; end;
  begin perform 1 from public.product_delivery limit 1; raise exception 'FALHA: leu instruções privadas'; exception when insufficient_privilege then null; end;
  begin perform public.decrement_stock(gen_random_uuid(), 1); raise exception 'FALHA: executou decrement_stock'; exception when insufficient_privilege then null; end;
  reset role; raise notice 'OK authenticated';
end $$;
-- Cada tabela com RLS ligado (deve retornar 0 linhas):
select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
-- Apenas um admin (deve ser <= 1):
select count(*) from public.profiles where role = 'admin';
-- Dashboard com dados fictícios: insira pedidos de teste (marcados [DEMO]) e compare a soma com:
-- select public.admin_dashboard(now() - interval '30 days', now());
