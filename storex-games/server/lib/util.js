// Utilitários puros (sem dependências).
const B32 = 'ABCDEFGHJKMNPQRSTVWXYZ23456789';
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export class HttpError extends Error {
  constructor(status, code, message, extra) { super(message || code); this.status = status; this.code = code; this.extra = extra; }
}
export const bad = (msg, extra) => new HttpError(422, 'validation', msg, extra);

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', ...headers } });
}
export function randomRef(prefix = 'SX', len = 14) {
  const b = crypto.getRandomValues(new Uint8Array(len));
  return prefix + Array.from(b, x => B32[x % B32.length]).join('');
}
export function randomHex(n = 12) {
  return Array.from(crypto.getRandomValues(new Uint8Array(n)), x => x.toString(16).padStart(2, '0')).join('');
}
export function safeEqual(a, b) {
  a = String(a ?? ''); b = String(b ?? '');
  let d = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0;
}
export function slugify(s) {
  return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 100);
}
// Validadores
export function str(v, name, { min = 0, max = 500, required = false } = {}) {
  if (v === undefined || v === null || v === '') { if (required) throw bad(`${name} é obrigatório`); return null; }
  if (typeof v !== 'string') throw bad(`${name} inválido`);
  const t = v.trim();
  if (required && !t) throw bad(`${name} é obrigatório`);
  if (t.length < min || t.length > max) throw bad(`${name} deve ter entre ${min} e ${max} caracteres`);
  return t || null;
}
export function int(v, name, { min = 0, max = 1e9, required = false } = {}) {
  if (v === undefined || v === null || v === '') { if (required) throw bad(`${name} é obrigatório`); return null; }
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw bad(`${name} inválido`);
  return n;
}
export function bool(v) { return v === true || v === 'true' || v === 1 || v === '1'; }
export function uuid(v, name = 'id') { if (typeof v !== 'string' || !UUID_RE.test(v)) throw bad(`${name} inválido`); return v.toLowerCase(); }
export function isoDate(v, name) {
  const d = new Date(v);
  if (typeof v !== 'string' || Number.isNaN(d.getTime())) throw bad(`${name} inválido`);
  return d.toISOString();
}
// Valor monetário: sempre inteiro em centavos.
export const brl = c => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
// Remove caracteres especiais do PostgREST em termos de busca.
export const cleanTerm = s => String(s ?? '').replace(/[%*_,()"'\\:.]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
export function csvCell(v) {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // evita injeção de fórmula
  return /[",\n\r;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
// Limitador simples em memória (melhor esforço; em serverless cada instância tem o seu).
const buckets = new Map();
export function rateLimit(key, limit, windowMs, now = Date.now()) {
  const b = buckets.get(key);
  if (!b || now - b.t > windowMs) { buckets.set(key, { t: now, n: 1 }); if (buckets.size > 5000) buckets.clear(); return true; }
  b.n++; return b.n <= limit;
}
export const _resetRateLimit = () => buckets.clear();
