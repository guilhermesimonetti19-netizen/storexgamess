import test from 'node:test'; import assert from 'node:assert/strict';
import { setup, U, PID } from '../helpers/env.js';
const mk = async (s, user = U.a, items = [{ productId: PID.P1, quantity: 1 }]) => (await s.call('POST', '/api/orders', { user, body: { items, idempotencyKey: 'k-' + Math.random().toString(36).slice(2, 14) } }).then(s.j)).body;
const wh = (s, body, t = 'whsec-test') => s.call('POST', `/api/webhooks/infinitepay${t === null ? '' : '?t=' + t}`, { body }).then(s.j);

test('webhook: confirma pagamento válido e é idempotente (duplicado não duplica nada)', async () => {
  const s = setup(); const o = await mk(s); const b = { order_nsu: o.ref, transaction_nsu: 'tx1', invoice_slug: 'inv1', receipt_url: 'https://comprovante.infinitepay.io/x' };
  const r1 = await wh(s, b); assert.equal(r1.status, 200); assert.equal(s.db.t.orders[0].payment_status, 'paid'); assert.equal(s.db.t.orders[0].delivery_status, 'pending');
  const paidAt = s.db.t.orders[0].paid_at; const r2 = await wh(s, b); assert.equal(r2.status, 200); assert.equal(r2.body.duplicate, true);
  await wh(s, b); assert.equal(s.db.t.orders[0].paid_at, paidAt); assert.equal(s.db.t.payment_events.filter(e => e.validation_result === 'accepted').length, 1);
  assert.equal(s.db.t.orders[0].receipt_url, 'https://comprovante.infinitepay.io/x');
});
test('webhook: estoque não é baixado duas vezes em evento repetido', async () => {
  const s = setup(); const o = await mk(s, U.a, [{ productId: PID.P2, quantity: 1 }]);
  await wh(s, { order_nsu: o.ref, transaction_nsu: 't' }); await wh(s, { order_nsu: o.ref, transaction_nsu: 't' }); await wh(s, { order_nsu: o.ref, transaction_nsu: 't2' });
  assert.equal(s.db.t.products.find(p => p.id === PID.P2).stock, 1);
});
test('webhook: sem/errado segredo é rejeitado (401) e não consulta a InfinitePay', async () => {
  const s = setup(); const o = await mk(s); assert.equal((await wh(s, { order_nsu: o.ref }, null)).status, 401); assert.equal((await wh(s, { order_nsu: o.ref }, 'errado')).status, 401);
  assert.equal(s.log.ip.filter(x => x[0] === 'check').length, 0);
});
test('webhook: corpo diz "pago" mas a InfinitePay diz que não → NÃO confirma', async () => {
  const s = setup(); const o = await mk(s); s.state.paid = false; const r = await wh(s, { order_nsu: o.ref, transaction_nsu: 't', paid_amount: 7990, status: 'paid' });
  assert.equal(r.status, 200); assert.equal(s.db.t.orders[0].payment_status, 'pending');
});
test('webhook: valor divergente é rejeitado e registrado', async () => {
  const s = setup(); const o = await mk(s); s.state.amount = 100; const r = await wh(s, { order_nsu: o.ref, transaction_nsu: 't' });
  assert.equal(s.db.t.orders[0].payment_status, 'pending'); assert.ok(s.db.t.payment_events.some(e => e.validation_result === 'rejected_amount_mismatch')); assert.equal(r.status, 200);
});
test('webhook: pedido desconhecido / payload inválido não quebram nem criam pedido', async () => {
  const s = setup(); assert.equal((await wh(s, { order_nsu: 'NAOEXISTE', transaction_nsu: 't' })).status, 200); assert.equal((await wh(s, { foo: 1 })).status, 200); assert.equal((await wh(s, { order_nsu: 123 })).status, 200);
  assert.equal(s.db.t.orders.length, 0); assert.ok(s.db.t.payment_events.some(e => e.validation_result === 'rejected_unknown_order'));
});
test('webhook: falha da InfinitePay → 400 (provedor reenviará) e pedido segue pendente', async () => {
  const s = setup(); const o = await mk(s); s.state.ipDown = false; const down = { ...s.state }; s.state.ipDown = true;
  const r = await wh(s, { order_nsu: o.ref, transaction_nsu: 't' }); assert.equal(r.status, 400); assert.equal(s.db.t.orders[0].payment_status, 'pending'); assert.ok(down);
});
test('webhook: pedido estornado não volta a "pago"', async () => {
  const s = setup(); const o = await mk(s); await wh(s, { order_nsu: o.ref, transaction_nsu: 't' });
  assert.equal((await s.call('POST', `/api/admin/orders/${s.db.t.orders[0].id}/flag-refund`, { user: U.admin, body: { justification: 'Estorno feito no app InfinitePay' } }).then(s.j)).status, 200);
  assert.equal(s.db.t.orders[0].payment_status, 'refunded'); assert.equal(s.db.t.orders[0].delivery_status, 'needs_review');
  await wh(s, { order_nsu: o.ref, transaction_nsu: 't9' }); assert.equal(s.db.t.orders[0].payment_status, 'refunded'); assert.ok(s.db.t.audit_log.some(a => a.action === 'order.refund_flag'));
});
test('IDOR: cliente B não vê, verifica, cancela nem clica no pedido do cliente A', async () => {
  const s = setup(); const o = await mk(s, U.a);
  for (const [m, p] of [['GET', ''], ['POST', '/verify'], ['POST', '/cancel'], ['POST', '/checkout'], ['POST', '/whatsapp-click']]) assert.equal((await s.call(m, `/api/orders/${o.ref}${p}`, { user: U.b, body: {} }).then(s.j)).status, 404, m + p);
  assert.deepEqual((await s.call('GET', '/api/orders', { user: U.b }).then(s.j)).body, []); assert.equal((await s.call('GET', `/api/orders/${o.ref}`).then(s.j)).status, 401);
});
test('cliente comum e anônimo não acessam NENHUMA rota admin (nem dashboard)', async () => {
  const s = setup(); const id = PID.P1; const routes = [['GET', '/dashboard'], ['GET', '/products'], ['POST', '/products'], ['PATCH', '/products/' + id], ['DELETE', '/products/' + id], ['GET', '/orders'], ['GET', '/orders/export.csv'], ['PATCH', '/orders/' + id], ['POST', '/orders/' + id + '/flag-refund'], ['POST', '/reconcile'], ['GET', '/settings'], ['PUT', '/settings'], ['GET', '/audit'], ['POST', '/products/' + id + '/images']];
  for (const [m, p] of routes) { assert.equal((await s.call(m, '/api/admin' + p, { user: U.a, body: {} }).then(s.j)).status, 403, 'cliente ' + m + p); assert.equal((await s.call(m, '/api/admin' + p, { body: {} }).then(s.j)).status, 401, 'anônimo ' + m + p); }
});
test('admin não consegue marcar pedido como pago manualmente', async () => {
  const s = setup(); await mk(s); const id = s.db.t.orders[0].id;
  for (const body of [{ status: 'paid' }, { payment_status: 'paid' }, { status: 'completed' }, { status: 'in_delivery' }]) { const r = await s.call('PATCH', '/api/admin/orders/' + id, { user: U.admin, body }).then(s.j); assert.ok([409, 422].includes(r.status), JSON.stringify(body)); }
  assert.equal(s.db.t.orders[0].payment_status, 'pending');
});
test('admin: produto CRUD, preço promocional inválido, slug duplicado, arquivar vendido, auditoria', async () => {
  const s = setup(); const A = (m, p, body) => s.call(m, '/api/admin' + p, { user: U.admin, body }).then(s.j);
  const c = await A('POST', '/products', { name: '[DEMO] Novo', price_cents: 5000, category_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', delivery: { instructions: 'Passo 1' } }); assert.equal(c.status, 201); assert.equal(c.body.slug, 'demo-novo');
  assert.equal((await A('POST', '/products', { name: '[DEMO] Novo', price_cents: 5000 })).status, 409);
  assert.equal((await A('POST', '/products', { name: 'X', price_cents: 0 })).status, 422);
  assert.equal((await A('POST', '/products', { name: 'Promo ruim', price_cents: 1000, promo_price_cents: 2000 })).status, 422);
  assert.equal((await A('POST', '/products', { name: 'Estoque', price_cents: 1000, track_stock: true })).status, 422);
  assert.equal((await A('PATCH', '/products/' + c.body.id, { price_cents: 6000, is_active: true })).status, 200);
  assert.ok(s.db.t.audit_log.some(a => a.action === 'product.price_change')); assert.equal((await s.call('GET', '/api/products/demo-novo').then(s.j)).status, 200);
  await mk(s, U.a, [{ productId: PID.P1, quantity: 1 }]); const d = await A('DELETE', '/products/' + PID.P1); assert.equal(d.body.archived, true); assert.ok(s.db.t.products.find(p => p.id === PID.P1).archived_at);
  assert.equal(s.db.t.order_items.length, 1, 'histórico preservado'); assert.equal((await A('DELETE', '/products/' + c.body.id)).body.deleted, true);
});
test('upload: aceita imagem real, rejeita HTML/SVG/falso e grande; nome do arquivo é aleatório', async () => {
  const s = setup(); const up = (ct, bytes) => s.call('POST', `/api/admin/products/${PID.P1}/images`, { user: U.admin, raw: bytes, headers: { 'Content-Type': ct } }).then(s.j);
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]); const ok = await up('image/png', png); assert.equal(ok.status, 201); assert.match(ok.body.url, /product-images\/aaaaaaaa-[\w-]+\/[0-9a-f]{24}\.png$/);
  assert.equal((await up('image/png', new TextEncoder().encode('<script>alert(1)</script>'))).status, 422); assert.equal((await up('text/html', new TextEncoder().encode('<html>'))).status, 422);
  assert.equal((await up('image/svg+xml', new TextEncoder().encode('<svg onload=alert(1)>'))).status, 422); assert.equal((await up('image/png', new Uint8Array(2 * 1024 * 1024 + 1).fill(1))).status, 422);
  assert.equal(s.db.t.product_images.length, 1);
  assert.equal((await s.call('POST', `/api/admin/products/${PID.P1}/images`, { user: U.a, raw: png, headers: { 'Content-Type': 'image/png' } }).then(s.j)).status, 403);
});
test('admin: notas internas não aparecem para o cliente; export CSV sem PII e protegido contra fórmula', async () => {
  const s = setup(); const o = await mk(s); const id = s.db.t.orders[0].id;
  await s.call('POST', `/api/admin/orders/${id}/notes`, { user: U.admin, body: { note: 'NOTA-INTERNA-XYZ' } }); const v = await s.call('GET', `/api/orders/${o.ref}`, { user: U.a }).then(s.j); assert.ok(!JSON.stringify(v.body).includes('NOTA-INTERNA'));
  const csv = await (await s.call('GET', '/api/admin/orders/export.csv', { user: U.admin })).text(); assert.ok(csv.startsWith('pedido,criado_em')); assert.ok(!csv.includes('@')); assert.ok(csv.includes(o.ref));
  const { csvCell } = await import('../../server/lib/util.js'); assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"'); assert.equal(csvCell('+1'), "'+1");
});
test('admin: configurações validam WhatsApp/URL e geram auditoria', async () => {
  const s = setup(); const P = b => s.call('PUT', '/api/admin/settings', { user: U.admin, body: b }).then(s.j);
  assert.equal((await P({ whatsapp_number: '(11) 9999' })).status, 422); assert.equal((await P({ instagram_url: 'javascript:alert(1)' })).status, 422); assert.equal((await P({ alert_pending_hours: 'abc' })).status, 422);
  assert.equal((await P({ whatsapp_number: '5511988887777', store_name: 'StoreX Games' })).status, 200); assert.ok(s.db.t.audit_log.some(a => a.action === 'settings.update'));
});
test('dashboard (admin): chama o cálculo no banco com período validado; período inválido é recusado', async () => {
  const s = setup(); s.db.rpcs = null; let args; const db = s.db; const orig = db.rpc; db.rpc = async (n, a) => { if (n === 'admin_dashboard') { args = a; return { kpis: {} }; } return orig.call(db, n, a); };
  const r = await s.call('GET', '/api/admin/dashboard?from=2026-10-01T00:00:00-03:00&to=2026-10-26T00:00:00-03:00&bucket=week', { user: U.admin }).then(s.j);
  assert.equal(r.status, 200); assert.equal(args.p_bucket, 'week'); assert.equal(r.body.net_available, false);
  assert.equal((await s.call('GET', '/api/admin/dashboard?from=2026-10-26T00:00:00Z&to=2026-10-01T00:00:00Z', { user: U.admin }).then(s.j)).status, 422);
  assert.equal((await s.call('GET', '/api/admin/dashboard?from=lixo', { user: U.admin }).then(s.j)).status, 422);
});
test('reconciliação: pendente antigo vira expirado; pago real é confirmado', async () => {
  const s = setup(); const a = await mk(s); const b = await mk(s, U.b, [{ productId: PID.P2, quantity: 1 }]); const old = new Date(Date.now() - 72 * 36e5).toISOString(); s.db.t.orders.forEach(o => o.created_at = old);
  s.state.paid = false; const r = await s.call('POST', '/api/admin/reconcile', { user: U.admin }).then(s.j); assert.equal(r.body.expired, 2); assert.equal(s.db.t.orders[0].status, 'expired'); assert.ok(a && b);
});
test('resposta tardia: pedido expirado que foi pago de verdade é confirmado (dinheiro real)', async () => {
  const s = setup(); const o = await mk(s); s.db.t.orders[0].payment_status = 'expired'; s.db.t.orders[0].status = 'expired';
  await wh(s, { order_nsu: o.ref, transaction_nsu: 'late' }); assert.equal(s.db.t.orders[0].payment_status, 'paid');
});
test('segredos: service_role não aparece em respostas de erro', async () => {
  const s = setup(); const bad = await s.call('GET', '/api/orders/xx', { user: U.a }); assert.ok(!(await bad.text()).includes('SECRET'));
});
