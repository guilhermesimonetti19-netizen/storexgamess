import { HttpError, safeEqual } from './util.js';
const bearer = req => { const h = req.headers.get('authorization') || ''; return /^Bearer\s+\S+$/i.test(h) ? h.slice(7).trim() : null; };

// Valida o token consultando o Supabase Auth (não confia em JWT decodificado localmente).
export async function getUser(ctx) {
  if (ctx.user !== undefined) return ctx.user;
  const token = bearer(ctx.request); let user = null;
  if (token) {
    try {
      const res = await ctx.fetch(`${ctx.env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`, { headers: { apikey: ctx.env.SUPABASE_ANON_KEY, Authorization: 'Bearer ' + token } });
      if (res.ok) { const u = await res.json(); if (u?.id) user = { id: u.id, email: u.email, confirmed: Boolean(u.email_confirmed_at || u.confirmed_at) }; }
    } catch { /* trata como não autenticado */ }
  }
  return (ctx.user = user);
}
export async function requireUser(ctx, { confirmed = false } = {}) {
  const u = await getUser(ctx);
  if (!u) throw new HttpError(401, 'unauthorized', 'Faça login para continuar.');
  if (confirmed && !u.confirmed) throw new HttpError(403, 'email_not_confirmed', 'Confirme seu e-mail para continuar.');
  return u;
}
export async function requireAdmin(ctx) {
  const u = await requireUser(ctx);
  const { rows } = await ctx.db.select('profiles', { filters: { id: 'eq.' + u.id }, select: 'id,role', limit: 1 });
  if (rows[0]?.role !== 'admin') throw new HttpError(403, 'forbidden', 'Acesso negado.'); // verificado no servidor a cada chamada
  return u;
}
export { safeEqual };
