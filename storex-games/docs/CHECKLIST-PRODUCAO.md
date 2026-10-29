# Checklist final de produção
- [ ] Decidir hospedagem (Cloudflare grátis ou Vercel Pro) e confirmar termos comerciais
- [ ] Rodar migrações 001–003 e `rls_tests.sql` (todos OK)
- [ ] Criar admin (`admin_bootstrap.sql`) e testar acesso de cliente comum ao /admin (deve negar)
- [ ] SMTP próprio no Supabase Auth; URLs de redirecionamento de produção
- [ ] Variáveis de ambiente no provedor; `.env` fora do Git
- [ ] Substituir `mascote-storex.png`; cadastrar WhatsApp oficial; revisar políticas com advogado/contador
- [ ] Teste real de R$ 1,00 na InfinitePay (com sua autorização) e conferir webhook + dashboard
- [ ] Rotina de backup (export) e plano de revogação de chaves
- [ ] Testar no celular (320–430 px) e desktop; teclado e zoom
