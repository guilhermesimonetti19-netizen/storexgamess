import test from 'node:test'; import assert from 'node:assert/strict';
import { setup, U } from '../helpers/env.js';
const mkp = (n, price, o = {}) => ({ id: `bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb${n}`, slug: 'c' + n, name: '[DEMO] C' + n, price_cents: price, is_active: true, track_stock: false, max_per_order: 10, created_at: '2026-01-01T00:00:00Z', ...o });
const cfg = Object.entries({ combo_enabled: '1', combo_qty: '2', combo_unit_cents: '3000', combo_price_cents: '4500' }).map(([key, value]) => ({ key, value }));
const buy = (s, items, k) => s.call('POST', '/api/orders', { user: U.a, body: { idempotencyKey: k, items } }).then(s.j);

test('combo: 2 de R$ 30 = R$ 45 (mistura, promoção vale, 3º cheio) e o checkout bate com o total', async () => {
  const s = setup(), A = mkp(1, 3000), B = mkp(2, 4000, { promo_price_cents: 3000 }); s.db.t.products.push(A, B); s.db.t.store_settings.push(...cfg);
  const r = await buy(s, [{ productId: A.id, quantity: 2 }, { productId: B.id, quantity: 1 }], 'combo-key-1');
  assert.equal(r.status, 201); assert.equal(r.body.totalCents, 7500); assert.equal(s.db.t.orders[0].discount_cents, 1500);
  const sent = s.log.ip.find(x => x[0] === 'links')[1]; assert.equal(sent.items.reduce((n, i) => n + i.price * i.quantity, 0), 7500);
});
test('combo: 1 unidade ou combo desligado não dá desconto', async () => {
  const s = setup(), A = mkp(1, 3000); s.db.t.products.push(A); s.db.t.store_settings.push(...cfg);
  assert.equal((await buy(s, [{ productId: A.id, quantity: 1 }], 'combo-key-2')).body.totalCents, 3000);
  s.db.t.store_settings.find(x => x.key === 'combo_enabled').value = '0';
  assert.equal((await buy(s, [{ productId: A.id, quantity: 2 }], 'combo-key-3')).body.totalCents, 6000);
});