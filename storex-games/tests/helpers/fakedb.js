// Banco em memória que imita a interface de server/lib/db.js (PostgREST). Apenas para testes.
const UNIQUE = { orders: [['public_ref'], ['order_nsu'], ['user_id', 'idempotency_key']], payment_events: [['provider_event_id']], products: [['slug']], product_images: [['path']], profiles: [['id']] };
const err = code => Object.assign(new Error('db_error'), { code });
const split = s => { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && d === 0) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
function test(row, col, expr) {
  const v = row[col]; const i = expr.indexOf('.'); const op = expr.slice(0, i), arg = expr.slice(i + 1);
  const num = x => (typeof v === 'string' && Number.isNaN(Number(v))) ? x : Number(x);
  switch (op) {
    case 'eq': return String(v) === arg;
    case 'neq': return String(v) !== arg;
    case 'in': return arg.slice(1, -1).split(',').includes(String(v));
    case 'gte': return v >= num(arg); case 'lte': return v <= num(arg); case 'gt': return v > num(arg); case 'lt': return v < num(arg);
    case 'is': return arg === 'null' ? v == null : v != null;
    case 'not': return !test(row, col, arg);
    case 'ilike': return String(v ?? '').toLowerCase().includes(arg.replace(/\*/g, '').toLowerCase());
    default: throw new Error('op não suportado: ' + op);
  }
}
export function createFakeDb(seed = {}, { views = {}, rpcs = {} } = {}) {
  const t = {}; for (const k of Object.keys(UNIQUE)) t[k] = []; for (const [k, v] of Object.entries(seed)) t[k] = v.map(r => ({ ...r }));
  const table = n => (views[n] ? views[n](t) : (t[n] ||= []));
  const match = (row, filters) => Object.entries(filters || {}).every(([k, v]) => {
    if (k === 'or') return split(v.slice(1, -1)).some(c => { const [col, ...r] = c.split('.'); return test(row, col, r.join('.')); });
    if (k === 'and') return split(v.slice(1, -1)).every(c => { const [col, ...r] = c.split('.'); return test(row, col, r.join('.')); });
    return test(row, k, v);
  });
  const checkUnique = (n, row, ignore) => { for (const cols of UNIQUE[n] || []) if (t[n].some(r => r !== ignore && cols.every(c => r[c] !== undefined && r[c] === row[c]))) throw err('23505'); };
  const calls = { rpc: [], selects: [] };
  return {
    t, calls,
    async select(n, o = {}) {
      calls.selects.push(n); let rows = table(n).filter(r => match(r, o.filters));
      if (o.order) for (const part of o.order.split(',').reverse()) { const [c, d] = part.split('.'); rows = [...rows].sort((a, b) => (a[c] > b[c] ? 1 : a[c] < b[c] ? -1 : 0) * (d === 'desc' ? -1 : 1)); }
      const count = rows.length; if (o.offset) rows = rows.slice(o.offset); if (o.limit !== undefined) rows = rows.slice(0, o.limit);
      return { rows: rows.map(r => ({ ...r })), count: o.count ? count : null };
    },
    async insert(n, rows) { const out = []; for (const r of rows) { const row = { id: crypto.randomUUID(), created_at: new Date().toISOString(), ...(n === 'orders' ? { status: 'pending', payment_status: 'pending', delivery_status: 'pending', currency: 'BRL' } : {}), ...r }; checkUnique(n, row); (t[n] ||= []).push(row); out.push({ ...row }); } return out; },
    async update(n, filters, patch) { const out = []; for (const r of table(n)) if (match(r, filters)) { Object.assign(r, patch); out.push({ ...r }); } return out; },
    async remove(n, filters) { const keep = [], gone = []; for (const r of t[n] || []) (match(r, filters) ? gone : keep).push(r); t[n] = keep; return gone; },
    async upsert(n, rows, onConflict) { const out = []; for (const r of rows) { const ex = (t[n] ||= []).find(x => x[onConflict] === r[onConflict]); if (ex) { Object.assign(ex, r); out.push({ ...ex }); } else out.push(...await this.insert(n, [r])); } return out; },
    async rpc(name, args) { calls.rpc.push([name, args]); if (name === 'decrement_stock') { const p = t.products.find(x => x.id === args.p_product); if (p?.track_stock) p.stock = Math.max(p.stock - args.p_qty, 0); return null; } if (rpcs[name]) return rpcs[name](args, t); throw new Error('rpc não suportada'); },
  };
}
// View catalog_products (promoção vigente resolvida) — espelha supabase/migrations/001_schema.sql
export const catalogView = t => t.products.filter(p => p.is_active && !p.archived_at).map(p => {
  const c = (t.categories || []).find(x => x.id === p.category_id); const now = Date.now();
  const promo = p.promo_price_cents && (!p.promo_starts_at || Date.parse(p.promo_starts_at) <= now) && (!p.promo_ends_at || Date.parse(p.promo_ends_at) > now) ? p.promo_price_cents : null;
  const img = (t.product_images || []).filter(i => i.product_id === p.id).sort((a, b) => a.position - b.position)[0];
  return { ...p, category_slug: c?.slug, category_name: c?.name, promo_active_cents: promo, effective_price_cents: promo ?? p.price_cents, in_stock: !p.track_stock || p.stock > 0, image_path: img?.path ?? null };
});
