# Relatório de QA (honesto) — 27/10/2026
Executado no ambiente de desenvolvimento: Node 22, **sem internet, sem Postgres, sem navegador**. `npm test` → 40 testes, 0 falhas (3 execuções seguidas). Uma falha intermitente foi vista uma única vez no teste "notas internas/CSV" e **não foi reproduzida** em 15+3 execuções; causa não identificada.

| Teste | Resultado | Evidência / observação |
|---|---|---|
| Catálogo só com ativos, promoção, sem vazar instruções | Aprovado | tests/functional/store.test.js (banco **simulado**) |
| Pesquisa, filtros, ordenação, paginação, termos especiais | Aprovado | idem |
| Adulteração de preço/total no navegador | Aprovado | preço vem do banco |
| Quantidade/estoque/inativo/vazio/anônimo/e-mail não verificado | Aprovado | idem |
| Clique duplo (idempotência) | Aprovado | mesma chave → 1 pedido |
| Retorno do checkout sem pagamento | Aprovado | continua pendente |
| Webhook: válido, duplicado, sem segredo, "pago" falso, valor divergente, desconhecido, falha do provedor, fora de ordem/tardio | Aprovado | payments-and-access.test.js (InfinitePay **simulada**) |
| Estorno (registro manual) e não voltar a "pago" | Aprovado | |
| IDOR entre clientes; cliente/anônimo nas rotas admin; admin não marca "pago" | Aprovado | |
| Upload: PNG válido; HTML/SVG/falso/grande rejeitados | Aprovado | |
| CSV sem PII e contra injeção de fórmula; auditoria | Aprovado | |
| Segredos fora de `public/`, sem innerHTML, sem script inline, RLS em todas as tabelas (análise do SQL) | Aprovado | static.test.js |
| **RLS/permissões reais no Postgres** (anon/cliente/admin) | **NÃO EXECUTADO** | rodar `supabase/tests/rls_tests.sql` |
| **SQL das migrações e `admin_dashboard`** (sintaxe e números) | **NÃO EXECUTADO** | nunca rodou em Postgres real; pode exigir ajustes |
| **Dashboard: cartões/gráficos vs. dados reais** | **NÃO EXECUTADO** | só a chamada/validação da API foi testada |
| **InfinitePay real** (formato de `/links`, `payment_check`) | **NÃO EXECUTADO** | sem rede/credenciais |
| **Supabase Auth** (cadastro, verificação, login, recuperação) | **NÃO EXECUTADO** | código do navegador escrito, sem teste |
| Home, catálogo, categoria, produto, carrinho vazio, login e 404 no Chrome headless com dados FICTÍCIOS (`npm run demo`), em 390 e 1366 px (home também 820); overflow horizontal checado em 320/360/390/430 px | Aprovado | capturas conferidas visualmente; bug de animação no catálogo achado e corrigido |
| Categoria (Steam e Xbox), listagem com filtros/ordenação, login e cadastro no Chrome headless com dados fictícios (desktop 1440 e mobile 390) | Aprovado | capturas conferidas; **gaveta de filtros no mobile, paginação numérica e validações do formulário não foram exercitadas** |
| **Não visto no navegador:** conta/pedido, admin e gráficos, checkout, 1920 px, navegação por teclado, zoom, Safari/Firefox | **NÃO EXECUTADO** | |
| **Adaptadores Cloudflare/Vercel** e deploy | **NÃO EXECUTADO** | |
| Referência lojadozk.com | **NÃO EXECUTADO** | sem acesso à internet no ambiente |
| Teste de carga / listas grandes | **NÃO EXECUTADO** | |
