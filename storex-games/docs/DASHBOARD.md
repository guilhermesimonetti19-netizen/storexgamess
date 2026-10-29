# Indicadores do dashboard (calculados em `admin_dashboard`, SQL)
- **Faturamento bruto confirmado:** soma de `total_cents` de pedidos `payment_status='paid'` com `paid_at` no período. Pendentes, cancelados e estornados ficam de fora.
- **Estornos:** pedidos `refunded` por `refunded_at`, mostrados à parte.
- **Valor líquido:** *indisponível* (taxas não são conhecidas; consulte o extrato InfinitePay).
- **Ticket médio:** faturamento ÷ pedidos pagos. **Comparação:** período imediatamente anterior de mesma duração.
- **Vendas hoje/7d/30d:** relativas ao momento atual (hoje = fuso America/Sao_Paulo).
- **Clientes:** perfis `customer`; "já compraram" = usuários com ao menos um pedido pago.
- **Alertas:** limiares em Configurações (horas de pedido pendente, estoque baixo). Estoque só para produtos com `track_stock`.
- **Limitações:** "contato no WhatsApp" = cliente abriu o botão (não prova mensagem enviada). Consultas dependem de índices incluídos; não testado com grandes volumes.
