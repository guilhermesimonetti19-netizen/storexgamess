# Segurança e privacidade
- **Segredos:** só em variáveis de ambiente do servidor; `service_role` nunca vai ao navegador (teste automático varre `public/`). `.env` no `.gitignore`.
- **Banco:** RLS ligado em todas as tabelas, **sem políticas** para `anon`/`authenticated` (negação total); privilégios revogados também da view e funções. Todo acesso via API (service_role) que valida usuário/papel a cada chamada.
- **Admin:** papel em `profiles.role`; trigger impede alteração por clientes; índice único = 1 admin; sem senha padrão; sem endpoint de promoção.
- **Preços/status:** total recalculado no servidor a partir do banco; cliente não envia preço. Pedido só vira pago após `payment_check` da InfinitePay com valor igual ao do pedido. Retorno do checkout/query string não altera status.
- **Webhook:** a InfinitePay não documenta assinatura; usamos segredo na URL (`?t=`, comparação em tempo constante) **+ reconsulta server-side**. Eventos idempotentes (`provider_event_id` único + atualização condicional).
- **IDOR:** pedidos sempre filtrados por `user_id` do token. Instruções pós-compra: tabela privada, snapshot no item, só enviadas se `paid`.
- **XSS:** frontend sem HTML bruto (testado); CSP restritiva; upload valida MIME + assinatura binária, 2 MB, nome aleatório.
- **Limitações:** rate limit em memória (por instância serverless); CSRF não se aplica (token Bearer, sem cookies); sem WAF. Estorno não é notificado pela InfinitePay → registro manual com justificativa e auditoria.
- **LGPD:** coleta mínima (e-mail, nome, pedidos); páginas de política são **modelos** a revisar com orientação jurídica; não inventam CNPJ/endereço.
