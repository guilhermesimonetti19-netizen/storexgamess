// Autenticação via Supabase Auth (REST). A chave anon é pública; a segurança real está no servidor e no banco (RLS).
import { config } from './api.js';
const KEY = 'sx_session'; let recoveryToken = null; const listeners = new Set();
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; } };
const write = s => { try { s ? localStorage.setItem(KEY, JSON.stringify(s)) : localStorage.removeItem(KEY); } catch { /* storage bloqueado */ } listeners.forEach(f => f(s)); };
export const onAuth = f => listeners.add(f);
export const isLoggedIn = () => Boolean(read()?.access_token);
async function gotrue(path, { method = 'POST', body, token, query = '' } = {}) {
  const c = await config(); let res;
  try { res = await fetch(`${c.supabaseUrl}/auth/v1/${path}${query}`, { method, headers: { apikey: c.supabaseAnonKey, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined }); }
  catch { throw new Error('Sem conexão. Tente novamente.'); }
  const d = await res.json().catch(() => ({})); if (!res.ok) { const e = new Error(d.msg || d.error_description || d.message || 'Erro'); e.code = d.error_code || d.code; e.status = res.status; throw e; } return d;
}
const store = d => write({ access_token: d.access_token, refresh_token: d.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (d.expires_in || 3600) });
export async function getToken() {
  const s = read(); if (!s) return null;
  if (s.expires_at - 60 > Date.now() / 1000) return s.access_token;
  try { store(await gotrue('token', { query: '?grant_type=refresh_token', body: { refresh_token: s.refresh_token } })); return read().access_token; } catch { write(null); return null; }
}
export async function login(email, password) {
  try {
    store(await gotrue('token', {
      query: '?grant_type=password',
      body: { email, password }
    }));
  } catch {
    throw new Error('E-mail ou senha incorretos.');
  }
}
export async function signup(email, password, displayName) {
  const redirect = encodeURIComponent(location.origin + '/entrar?verificado=1');
  try { await gotrue('signup', { query: '?redirect_to=' + redirect, body: { email, password, data: { display_name: displayName } } }); }
  catch (e) { if (e.status === 422 && /password/i.test(e.message)) throw new Error('Senha fraca. Use ao menos 8 caracteres.'); throw new Error('Não foi possível cadastrar. Verifique os dados.'); }
}
export async function recover(email) { // resposta sempre genérica (não revela se o e-mail existe)
  try { await gotrue('recover', { query: '?redirect_to=' + encodeURIComponent(location.origin + '/redefinir-senha'), body: { email } }); } catch { /* ignorado de propósito */ }
}
export async function setNewPassword(password) {
  const t = recoveryToken || (await getToken()); if (!t) throw new Error('Link expirado. Solicite uma nova recuperação.');
  try { await gotrue('user', { method: 'PUT', token: t, body: { password } }); } catch { throw new Error('Não foi possível redefinir. O link pode ter expirado.'); } recoveryToken = null;
}
export async function logout() { const t = read()?.access_token; write(null); if (t) gotrue('logout', { token: t }).catch(() => {}); }
// Trata o retorno dos e-mails de verificação/recuperação (tokens vêm no #hash).
export function consumeHash() {
  if (!location.hash.includes('access_token')) return null;
  const p = new URLSearchParams(location.hash.slice(1)); history.replaceState({}, '', location.pathname + location.search);
  const type = p.get('type'); const d = { access_token: p.get('access_token'), refresh_token: p.get('refresh_token'), expires_in: Number(p.get('expires_in')) || 3600 };
  if (type === 'recovery') { recoveryToken = d.access_token; return 'recovery'; } store(d); return type || 'login';
}
