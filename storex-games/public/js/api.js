import { getToken } from './auth.js';
export class ApiError extends Error { constructor(status, code, message) { super(message); this.status = status; this.code = code; } }
export async function api(path, { method = 'GET', body, raw, contentType, auth = true } = {}) {
  const headers = {}; const token = auth ? await getToken() : null;
  if (token) headers.Authorization = 'Bearer ' + token;
  if (body !== undefined) headers['Content-Type'] = 'application/json'; if (raw) headers['Content-Type'] = contentType;
  let res; try { res = await fetch(path, { method, headers, body: raw ?? (body !== undefined ? JSON.stringify(body) : undefined) }); }
  catch { throw new ApiError(0, 'network', 'Sem conexão. Verifique sua internet e tente novamente.'); }
  if (res.headers.get('content-type')?.includes('text/csv')) return res.text();
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(res.status, data?.error || 'error', data?.message || 'Não foi possível concluir. Tente novamente.');
  return data;
}
let cfg; export const config = async () => (cfg ||= await api('/api/config', { auth: false }));
let st; export const settings = async () => (st ||= await api('/api/settings', { auth: false }).catch(() => ({})));
