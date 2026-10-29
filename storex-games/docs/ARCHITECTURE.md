# Arquitetura
Navegador (SPA em `public/`) → `/api/*` (função serverless, `server/router.js`) → Supabase (Postgres via REST com service_role; Storage) e InfinitePay (checkout hospedado + `payment_check`). Login: navegador ↔ Supabase Auth (chave anon); o servidor valida cada token consultando `/auth/v1/user`.
Fluxo de compra: carrinho (local) → `POST /api/orders` (servidor recalcula preços, grava snapshot, cria link) → checkout InfinitePay → webhook e/ou `POST /api/orders/:ref/verify` → `payment_check` → pedido `paid` → instruções + botão WhatsApp liberados.
Banco: ver `supabase/migrations/`. Dinheiro = inteiros em centavos (BRL); datas em UTC, exibidas em America/Sao_Paulo.
