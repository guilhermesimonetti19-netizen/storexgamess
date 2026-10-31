import { HttpError, bad, uuid, int, str, randomRef, UUID_RE } from './util.js';
import { createCheckoutLink, isConfigured } from './infinitepay.js';
import { loadSettings, waLink } from './settings.js';
import { COMBO_KEYS, comboConfig, applyCombo, checkoutItems } from './combo.js';

const KEY_RE = /^[A-Za-z0-9_-]{8,64}$/;

export function normalizeItems(raw) {
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 20) throw bad('Carrinho vazio ou grande demais.');
  const m = new Map();
  for (const it of raw) {
    const id = uuid(it?.productId, 'produto');
    const q = int(it?.quantity, 'quantidade', { min: 1, max: 10, required: true });
    m.set(id, Math.min(10, (m.get(id) || 0) + q));
  }
  return [...m].map(([productId, quantity]) => ({ productId, quantity }));
}

// Cupom de primeira compra (validado no servidor).
export const COUPON = { code: 'STORE10', percent: 10 };
export async function couponFor(ctx, user, raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  if (typeof raw !== 'string' || raw.trim().toUpperCase() !== COUPON.code) throw new HttpError(422, 'coupon', 'Cupom inválido.');
  const { rows } = await ctx.db.select('orders', { filters: { user_id: 'eq.' + user.id, payment_status: 'in.(paid,pending)' }, select: 'payment_status,coupon_code', limit: 100 });
  if (rows.some(o => o.payment_status === 'paid' || o.coupon_code)) throw new HttpError(409, 'coupon', 'O cupom vale apenas na primeira compra.');
  return COUPON;
}
function spreadDiscount(items, discount) { // dilui o cupom nas unidades; a soma bate com o total
  const units = items.flatMap(i => Array.from({ length: i.quantity }, () => ({ price: i.price, description: i.description })));
  const sum = units.reduce((s, u) => s + u.price, 0); let left = discount;
  units.forEach((u, k) => { const cut = k === units.length - 1 ? left : Math.min(left, Math.floor(discount * u.price / sum)); u.price -= cut; left -= cut; });
  const m = new Map();
  for (const u of units) { const key = u.price + '|' + u.description; m.set(key, m.get(key) ? { ...u, quantity: m.get(key).quantity + 1 } : { ...u, quantity: 1 }); }
  return [...m.values()];
}

// Preços e combo SEMPRE calculados no servidor (view catalog_products + store_settings); nada do navegador é aceito como preço/total.
export async function createOrder(ctx, user, body) {
  const key = body?.idempotencyKey;
  if (typeof key !== 'string' || !KEY_RE.test(key)) throw bad('Chave de idempotência inválida.');
  const existing = await ctx.db.select('orders', { filters: { user_id: 'eq.' + user.id, idempotency_key: 'eq.' + key }, limit: 1 });
  if (existing.rows[0]) return existing.rows[0];
  const items = normalizeItems(body?.items);
  const ids = items.map(i => i.productId);
  const [{ rows: prods }, { rows: deliv }] = await Promise.all([
    ctx.db.select('catalog_products', { filters: { id: `in.(${ids.join(',')})` } }),
    ctx.db.select('product_delivery', { filters: { product_id: `in.(${ids.join(',')})` } }),
  ]);
  const byId = new Map(prods.map(p => [p.id, p])); const dById = new Map(deliv.map(d => [d.product_id, d]));
  let subtotal = 0; const lines = [];
  for (const it of items) {
    const p = byId.get(it.productId);
    if (!p) throw new HttpError(409, 'unavailable', 'Um dos produtos não está mais disponível.');
    if (it.quantity > p.max_per_order) throw new HttpError(409, 'quantity', `Quantidade máxima para "${p.name}": ${p.max_per_order}.`);
    if (p.track_stock && (p.stock ?? 0) < it.quantity) throw new HttpError(409, 'out_of_stock', `"${p.name}" sem estoque suficiente.`);
    const unit = p.effective_price_cents; const sub = unit * it.quantity; subtotal += sub;
    const d = dById.get(p.id) || {};
    lines.push({ product_id: p.id, name_snapshot: p.name, description_snapshot: p.short_description, category_snapshot: p.category_name, platform_snapshot: p.platform,
      quantity: it.quantity, unit_price_cents: unit, subtotal_cents: sub, track_stock: Boolean(p.track_stock),
      delivery_snapshot: { instructions: d.instructions ?? null } });
  }
  if (!(subtotal > 0)) throw bad('Total inválido.');
  const cfg = comboConfig(await loadSettings(ctx.db, COMBO_KEYS));
  const { groups, discount } = applyCombo(lines.map(l => ({ unit: l.unit_price_cents, quantity: l.quantity })), cfg);
  const cp = await couponFor(ctx, user, body?.coupon);
  const couponCents = cp ? Math.floor((subtotal - discount) * cp.percent / 100) : 0;
  const total = subtotal - discount - couponCents;
  if (!(total > 0)) throw bad('Total inválido.');
  const ref = randomRef();
  let order;
  try {
    [order] = await ctx.db.insert('orders', [{ id: crypto.randomUUID(), public_ref: ref, order_nsu: ref, user_id: user.id, idempotency_key: key,
      subtotal_cents: subtotal, discount_cents: discount, coupon_code: cp?.code ?? null, coupon_cents: couponCents,
      combo_snapshot: groups ? { ...cfg, groups } : null, total_cents: total }]);
  } catch (e) { // clique duplicado concorrente: devolve o pedido já criado
    if (e.code === '23505') { const r = await ctx.db.select('orders', { filters: { user_id: 'eq.' + user.id, idempotency_key: 'eq.' + key }, limit: 1 }); if (r.rows[0]) return r.rows[0]; }
    throw e;
  }
  try { await ctx.db.insert('order_items', lines.map(l => ({ ...l, order_id: order.id }))); }
  catch (e) { await ctx.db.remove('orders', { id: 'eq.' + order.id }).catch(() => {}); throw e; }
  return order;
}

export async function ensureCheckout(ctx, order) {
  if (order.checkout_url) return order.checkout_url;
  if (!isConfigured(ctx.env)) return null; // modo de teste: sem checkout real
  const { rows: items } = await ctx.db.select('order_items', { filters: { order_id: 'eq.' + order.id } });
  const base = ctx.env.APP_BASE_URL.replace(/\/$/, '');
  const t = ctx.env.WEBHOOK_SECRET ? '?t=' + encodeURIComponent(ctx.env.WEBHOOK_SECRET) : '';
  const plain = checkoutItems(items.map(i => ({ name: i.name_snapshot, unit: i.unit_price_cents, quantity: i.quantity })), order.combo_snapshot);
  const url = await createCheckoutLink(ctx.env, ctx.fetch, {
    orderNsu: order.order_nsu, redirectUrl: `${base}/pedido/${order.public_ref}`, webhookUrl: `${base}/api/webhooks/infinitepay${t}`,
    items: order.coupon_cents > 0 ? spreadDiscount(plain, order.coupon_cents) : plain });
  await ctx.db.update('orders', { id: 'eq.' + order.id }, { checkout_url: url });
  return url;
}

// Visão do cliente: instruções só quando o pagamento foi confirmado NO SERVIDOR.
export async function serializeOrder(ctx, order, items) {
  const paid = order.payment_status === 'paid';
  const settings = paid ? await loadSettings(ctx.db) : {};
  const out = {
    ref: order.public_ref, status: order.status, paymentStatus: order.payment_status, deliveryStatus: order.delivery_status,
    totalCents: order.total_cents, discountCents: order.discount_cents || 0, couponCents: order.coupon_cents || 0, currency: order.currency, createdAt: order.created_at, paidAt: order.paid_at,
    checkoutUrl: order.payment_status === 'pending' ? order.checkout_url : null, receiptUrl: paid ? order.receipt_url : null,
    items: items.map(i => ({ name: i.name_snapshot, quantity: i.quantity, unitPriceCents: i.unit_price_cents, subtotalCents: i.subtotal_cents,
      instructions: paid ? { instructions: i.delivery_snapshot?.instructions ?? null } : null })),
  };
  if (paid) out.whatsappUrl = waLink(settings, order.public_ref, items.map(i => i.name_snapshot));
  return out;
}

export async function getOwnOrder(ctx, user, ref) {
  if (typeof ref !== 'string' || !/^[A-Z0-9]{6,30}$/.test(ref)) throw new HttpError(404, 'not_found', 'Pedido não encontrado.');
  const { rows } = await ctx.db.select('orders', { filters: { public_ref: 'eq.' + ref, user_id: 'eq.' + user.id }, limit: 1 }); // IDOR: filtro por dono
  if (!rows[0]) throw new HttpError(404, 'not_found', 'Pedido não encontrado.');
  const { rows: items } = await ctx.db.select('order_items', { filters: { order_id: 'eq.' + rows[0].id }, order: 'created_at.asc' });
  return { order: rows[0], items };
}
export { UUID_RE, str };