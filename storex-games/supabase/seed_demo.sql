-- DADOS FICTÍCIOS (demonstração). NÃO execute em produção real. Todos os nomes começam com [DEMO].
insert into public.products (category_id, slug, name, short_description, platform, price_cents, is_active, is_new, max_per_order)
select c.id, 'demo-jogo-exemplo', '[DEMO] Jogo de Exemplo', 'Produto fictício para testar a loja.', 'Steam', 4990, true, true, 1
from public.categories c where c.slug = 'jogos-pc-steam' on conflict (slug) do nothing;
insert into public.product_delivery (product_id, instructions, steps, eta_text)
select id, 'Instruções FICTÍCIAS de exemplo.', '1) Abra o WhatsApp. 2) Informe o pedido.', 'Até 1 hora (exemplo)'
from public.products where slug = 'demo-jogo-exemplo' on conflict (product_id) do nothing;
-- Remover depois: delete from public.products where slug like 'demo-%';
