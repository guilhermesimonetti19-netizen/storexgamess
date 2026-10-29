# Guia de configuração e publicação (passo a passo)

## A. Supabase (grátis)
1. Crie conta em https://supabase.com → **New project** (nome `storex`, região South America (São Paulo), anote a senha do banco). Aguarde ~2 min.
2. **SQL Editor → New query**: cole e execute, **nesta ordem**, `supabase/migrations/001_schema.sql`, `002_rls_storage.sql`, `003_dashboard.sql`. Sucesso = "Success. No rows returned".
3. (Opcional, só teste) `supabase/seed_demo.sql`. Depois rode `supabase/tests/rls_tests.sql` e confira os `OK`.
4. **Project Settings → API**: copie *Project URL*, chave *anon/publishable* e *service_role* (secreta!) para o `.env` (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`). Nunca envie o `.env` ao GitHub.
5. **Authentication → Providers → Email**: habilite *Confirm email*. **Authentication → URL Configuration**: *Site URL* = URL do site; em *Redirect URLs* adicione `http://localhost:3000/**` (dev) e `https://SEU-DOMINIO/**` (produção). Em **Email Templates** confira o e-mail de confirmação/recuperação (o e-mail padrão do Supabase tem limite baixo de envios; para produção configure SMTP próprio em *Auth → SMTP*).
6. Storage: o bucket `product-images` já é criado pelo SQL 002 (leitura pública; escrita só pelo servidor).

## B. Administrador principal
1. Cadastre-se no site com seu e-mail e confirme. 2. SQL Editor → abra `supabase/admin_bootstrap.sql`, troque o e-mail e execute. 3. Entre no site: aparece "Painel administrativo" em *Minha conta*. Só existe 1 admin (índice único). **Revogar:** linha comentada no mesmo arquivo + rotacionar chaves em *Settings → API*.

## C. InfinitePay
1. No app InfinitePay → **Checkout** (habilite o Checkout Integrado). Sua **InfiniteTag** (sem `$`) vai em `INFINITEPAY_HANDLE`. Deixe vazio para modo de teste.
2. Gere um `WEBHOOK_SECRET` aleatório longo. O sistema anexa `?t=` à URL do webhook automaticamente: `https://SEU-DOMINIO/api/webhooks/infinitepay?t=...`.
3. **Não faça transação real sem decidir conscientemente.** Não há sandbox documentado publicamente; teste com um produto de R$ 1,00 só quando estiver pronto.

## D. Hospedagem (decisão pendente — ver COSTS.md)
**Cloudflare Pages (recomendado, grátis):** crie repositório no GitHub (`git init`, `git add .`, `git commit`, envie — o `.gitignore` já exclui `.env`). Cloudflare → Workers & Pages → Create → Pages → Connect to Git → framework *None*, build command vazio, output directory `public`. Em *Settings → Variables* adicione as variáveis do `.env.example` (marque as secretas como *Secret*). Cada `git push` publica. Reverter: aba *Deployments → Rollback*.
**Vercel:** exige plano **Pro** para loja (pago). Importar o repositório, *Output Directory* = `public`, mesmas variáveis.
Depois do deploy: atualize `APP_BASE_URL`, *Site URL* e *Redirect URLs* do Supabase com a URL final. Teste: cadastro → login → catálogo → pedido → checkout.

## E. Backup e atualização
Supabase Free **não tem backup automático**: exporte periodicamente (SQL Editor → rode `select * from ...` e use *Export CSV*, ou `pg_dump` pela string de conexão em *Settings → Database*). Projetos Free **pausam após 7 dias sem uso** (reative no painel). Atualizar o site = editar arquivos + `git push`.
