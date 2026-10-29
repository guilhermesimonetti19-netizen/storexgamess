# StoreX Games — loja virtual de jogos e produtos digitais

HTML/CSS/JS puro (sem framework) + Supabase (Postgres, Auth, Storage) + InfinitePay (checkout hospedado) + entrega manual via WhatsApp.
Backend: funções serverless em `server/` (sem dependências npm), com adaptadores para **Cloudflare Pages** (`functions/`) e **Vercel** (`api/`).

> ⚠️ **Leia antes de publicar:** a Vercel **Hobby proíbe uso comercial** (loja = comercial). Veja `docs/COSTS.md`. Desenvolvimento/testes locais são grátis.

## Rodar localmente (iniciante)
1. Instale o **Node.js 20+** (https://nodejs.org, versão LTS) e o **VS Code** (https://code.visualstudio.com).
2. Descompacte o ZIP, abra a pasta `storex-games` no VS Code (Arquivo → Abrir Pasta).
3. Abra o terminal (Terminal → Novo Terminal) e rode os testes: `npm test` (deve mostrar `fail 0`).
4. Configure o Supabase seguindo `docs/DEPLOY.md` (passos 1–5), copie `.env.example` para `.env` e preencha.
5. `npm run dev` → abra http://localhost:3000.

## Estrutura
`public/` site (HTML/CSS/JS) · `server/` API (router, libs) · `api/` e `functions/` adaptadores de hospedagem · `supabase/` SQL (migrações, bootstrap do admin, testes, seed fictício) · `tests/` testes automáticos · `docs/` documentação.

## Personalizar
- **Prévia sem configurar nada:** `npm run demo` abre a loja em http://localhost:3000 com produtos FICTÍCIOS (somente leitura; login e compra não funcionam nesse modo).
- **Imagens (já incluídas em `public/assets/`):** logo/ícone (`logo`, `favicon`, `icon-192`), `banner`, cards da home (`card-xbox/steam/packs`), artes de cada categoria (`cat-xbox/steam/packs`) e mascotes de apoio (`mascote-sentado`, `mascote-terno`). Para trocar, substitua o arquivo mantendo o nome.
- **(antigo)** coloque a arte em `public/assets/mascote-emblema.webp` (emblema redondo, usado no hero) e `mascote-storex.png` (corpo inteiro, fundo transparente). Os mockups `referencia-*.png` ficam só como referência (não são exibidos).
- **WhatsApp, mensagem, textos, Instagram, políticas:** Painel Admin → Configurações.
- **Categorias/produtos/imagens/instruções pós-compra:** Painel Admin → Produtos.
- **Cores/fontes:** variáveis no topo de `public/css/style.css`. Fonte Poppins (licença OFL) embutida em `public/fonts/`.

## Primeiro produto + pedido de teste sem dinheiro real
1. Entre como admin → Produtos → Novo produto (preço, categoria, ative; preencha as instruções pós-compra) → salve → envie imagem.
2. Deixe `INFINITEPAY_HANDLE` vazio (modo de teste): crie outra conta, confirme o e-mail, adicione ao carrinho e finalize. O pedido fica **Aguardando pagamento** (nunca é marcado como pago sem a InfinitePay).
3. Para testar a confirmação com a lógica real, use `npm test` (simula a InfinitePay). Transação real exige sua autorização e credenciais.
