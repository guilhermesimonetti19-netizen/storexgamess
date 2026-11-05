# InfinitePay — como está integrado (docs consultadas em 26/10/2026)
Fontes: https://www.infinitepay.io/checkout-documentacao · https://ajuda.infinitepay.io/pt-BR/articles/10766888-como-usar-o-checkout-da-infinitepay
- Criar link: `POST https://api.checkout.infinitepay.io/links` com `handle`, `order_nsu`, `items[{quantity, price(centavos), description}]`, `redirect_url`, `webhook_url`. **A doc pública não mostra API key**, por isso o código não inventa cabeçalho de autenticação (`INFINITEPAY_API_KEY` não é usada).
- Conferir: `POST .../payment_check` (`handle`, `order_nsu`, `transaction_nsu`, `slug`) → `paid`, `amount`, `paid_amount`. Quando `INFINITEPAY_API_KEY` estiver configurada, envie-a também no header `X-Api-Key`.
- Webhook: sem assinatura documentada → ver SECURITY.md. Responde 200 (ok/ignorado) ou 400 (erro transitório → reenvio).
- O header `X-Api-Key` é enviado tanto na criação do link quanto em `/payment_check`, quando `INFINITEPAY_API_KEY` estiver configurada. Valide a integração com uma transação real de baixo valor antes de reabrir as vendas.
