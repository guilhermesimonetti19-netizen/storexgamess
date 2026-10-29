-- Criar o administrador principal (execute UMA vez, no SQL Editor, como dono do projeto).
-- 1) Cadastre-se normalmente na loja e confirme o e-mail.
-- 2) Troque o e-mail abaixo pelo SEU e execute. Nenhuma senha/credencial é definida aqui.
update public.profiles set role = 'admin'
where id = (select id from auth.users where email = 'SEU-EMAIL@exemplo.com');
-- Conferir:
select p.id, u.email, p.role from public.profiles p join auth.users u on u.id = p.id where p.role = 'admin';
-- Revogar acesso administrativo (incidente):
-- update public.profiles set role = 'customer' where role = 'admin';
-- (e, se necessário, desative o usuário no painel Authentication > Users e rotacione as chaves)
