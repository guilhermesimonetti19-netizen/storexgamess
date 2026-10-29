import test from 'node:test'; import assert from 'node:assert/strict';
import { setup, U, PID } from '../helpers/env.js';

const order = (s, user, items, key = 'key-' + Math.random().toString(36).slice(2, 12)) => s.call('POST', '/api/orders', { user, body: { items, idempotencyKey: key } }).then(s.j);

test('catálogo: só ativos, promoção aplicada, instruções privadas não vazam', async () => {
  const s = setup(); const { body } = await s.call('GET', '/api/products').then(s.j);
  assert.equal(body.items.length, 2); assert.ok(!body.items.find(i => i.slug === 'inativo'));
  assert.equal(body.items.find(i => i.slug === 'jogo-teste-1').effective_price_cents, 7990);
  assert.ok(!JSON.stringify(body).includes('SEGREDO'));
  const d = await s.call('GET', '/api/products/jogo-teste-1').then(s.j); assert.equal(d.status, 200); assert.ok(!JSON.stringify(d.body).includes('SEGREDO'));
  assert.equal((await s.call('GET', '/api/products/inativo').then(s.j)).status, 404);
  assert.equal((await s.call('GET', '/api/products/nao-existe').then(s.j)).status, 404);
});
test('pesquisa, filtros, ordenação e paginação', async () => {
  const s = setup(); const g = p => s.call('GET', '/api/products?' + p).then(s.j).then(r => r.body);
  assert.deepEqual((await g('q=teste 2')).items.map(i => i.slug), ['jogo-teste-2']);
  assert.equal((await g('platform=Steam')).items.length, 1);
  assert.deepEqual((await g('sort=price_asc')).items.map(i => i.slug), ['jogo-teste-2', 'jogo-teste-1']);
  assert.equal((await g('min=6000&max=9000')).items.length, 1);
  assert.equal((await g('pageSize=1&page=2')).items.length, 1);
  assert.equal((await g('q=%25%2C()*')).items.length, 2, 'caracteres especiais são neutralizados');
  assert.equal((await s.call('GET', '/api/products?min=abc').then(s.j)).status, 422);
});
test('pedido: preço vem do banco; adulteração do navegador é ignorada', async () => {
  const s = setup(); const r = await s.call('POST', '/api/orders', { user: U.a, body: { idempotencyKey: 'key-12345678', items: [{ productId: PID.P1, quantity: 1, price: 1, totalCents: 1 }], total: 1 } }).then(s.j);
  assert.equal(r.status, 201); assert.equal(r.body.totalCents, 7990);
  assert.equal(s.db.t.orders[0].total_cents, 7990); assert.equal(s.db.t.order_items[0].unit_price_cents, 7990);
  const sent = s.log.ip.find(x => x[0] === 'links')[1]; assert.equal(sent.items[0].price, 7990); assert.match(sent.webhook_url, /whsec-test/); assert.equal(sent.order_nsu, s.db.t.orders[0].order_nsu);
});
test('pedido: validações (quantidade, estoque, inativo, vazio, anônimo, não verificado)', async () => {
  const s = setup();
  assert.equal((await order(s, U.a, [{ productId: PID.P1, quantity: 2 }])).status, 409);
  assert.equal((await order(s, U.a, [{ productId: PID.P2, quantity: 3 }])).status, 409, 'estoque 2 < 3');
  assert.equal((await order(s, U.a, [{ productId: PID.P3, quantity: 1 }])).status, 409);
  assert.equal((await order(s, U.a, [{ productId: PID.P1, quantity: -1 }])).status, 422);
  assert.equal((await order(s, U.a, [{ productId: 'x', quantity: 1 }])).status, 422);
  assert.equal((await order(s, U.a, [])).status, 422);
  assert.equal((await order(s, undefined, [{ productId: PID.P1, quantity: 1 }])).status, 401);
  assert.equal((await order(s, U.unverified, [{ productId: PID.P1, quantity: 1 }])).status, 403);
  assert.equal(s.db.t.orders.length, 0);
});
test('pedido: clique repetido (mesma chave) não duplica', async () => {
  const s = setup(); const a = await order(s, U.a, [{ productId: PID.P1, quantity: 1 }], 'same-key-1234'); const b = await order(s, U.a, [{ productId: PID.P1, quantity: 1 }], 'same-key-1234');
  assert.equal(a.body.ref, b.body.ref); assert.equal(s.db.t.orders.length, 1);
});
test('modo teste: sem handle não há checkout e nada é marcado como pago', async () => {
  const s = setup({ env: { INFINITEPAY_HANDLE: '' } }); const r = await order(s, U.a, [{ productId: PID.P1, quantity: 1 }]);
  assert.equal(r.body.testMode, true); assert.equal(r.body.checkoutUrl, null); assert.equal(s.db.t.orders[0].payment_status, 'pending');
});
test('indisponibilidade da InfinitePay: pedido fica pendente, sem falsa confirmação', async () => {
  const s = setup(); s.state.ipDown = true; const r = await order(s, U.a, [{ productId: PID.P1, quantity: 1 }]);
  assert.equal(r.status, 201); assert.equal(r.body.checkoutError, true); assert.equal(s.db.t.orders[0].payment_status, 'pending');
  s.state.ipDown = false; const retry = await s.call('POST', `/api/orders/${r.body.ref}/checkout`, { user: U.a }).then(s.j); assert.match(retry.body.checkoutUrl, /^https:\/\/checkout\.infinitepay\.io/);
});
test('pagamento confirmado via verify: instruções só aparecem depois; estoque baixa; WhatsApp correto', async () => {
  const s = setup(); const o = await order(s, U.a, [{ productId: PID.P2, quantity: 2 }]); const ref = o.body.ref;
  let v = await s.call('GET', `/api/orders/${ref}`, { user: U.a }).then(s.j); assert.ok(!JSON.stringify(v.body).includes('SEGREDO')); assert.equal(v.body.whatsappUrl, undefined);
  s.state.paid = false; assert.equal((await s.call('POST', `/api/orders/${ref}/verify`, { user: U.a, body: { transaction_nsu: 't1', slug: 's1' } }).then(s.j)).body.paid, false);
  assert.equal(s.db.t.orders[0].payment_status, 'pending', 'retorno do checkout sem pagamento não confirma');
  s.state.paid = true; assert.equal((await s.call('POST', `/api/orders/${ref}/verify`, { user: U.a, body: { transaction_nsu: 't1', slug: 's1' } }).then(s.j)).body.paid, true);
  v = await s.call('GET', `/api/orders/${ref}`, { user: U.a }).then(s.j);
  assert.equal(v.body.paymentStatus, 'paid'); assert.match(JSON.stringify(v.body), /SEGREDO-INSTRUCOES-P2/);
  const u = new URL(v.body.whatsappUrl); assert.equal(u.hostname, 'wa.me'); assert.equal(u.pathname, '/5511999999999'); assert.ok(decodeURIComponent(u.searchParams.get('text')).includes(ref));
  assert.equal(s.db.t.products.find(p => p.id === PID.P2).stock, 0);
});
test('instruções são snapshot: mudar o produto depois não altera pedido antigo', async () => {
  const s = setup(); const o = await order(s, U.a, [{ productId: PID.P1, quantity: 1 }]);
  s.db.t.product_delivery[0].instructions = 'NOVA'; await s.call('POST', `/api/orders/${o.body.ref}/verify`, { user: U.a, body: {} });
  const v = await s.call('GET', `/api/orders/${o.body.ref}`, { user: U.a }).then(s.j); assert.match(JSON.stringify(v.body), /SEGREDO-INSTRUCOES-P1/); assert.ok(!JSON.stringify(v.body).includes('NOVA'));
});
test('cancelamento: só pedido pendente', async () => {
  const s = setup(); const o = await order(s, U.a, [{ productId: PID.P1, quantity: 1 }]);
  assert.equal((await s.call('POST', `/api/orders/${o.body.ref}/cancel`, { user: U.a }).then(s.j)).status, 200);
  assert.equal(s.db.t.orders[0].status, 'cancelled'); assert.equal((await s.call('POST', `/api/orders/${o.body.ref}/cancel`, { user: U.a }).then(s.j)).status, 409);
});
test('perfil: só nome/telefone; role é ignorado', async () => {
  const s = setup(); const r = await s.call('PATCH', '/api/me', { user: U.a, body: { displayName: 'Ana', role: 'admin', is_admin: true } }).then(s.j); assert.equal(r.status, 200);
  assert.equal(s.db.t.profiles.find(p => p.id === U.a.id).role, 'customer'); assert.equal(s.db.t.profiles.find(p => p.id === U.a.id).display_name, 'Ana');
});
test('config pública nunca expõe service_role / segredo', async () => {
  const s = setup(); const r = await s.call('GET', '/api/config'); const t = await r.text();
  assert.ok(!t.includes('SECRET') && !t.includes('whsec') && !t.includes('service')); assert.ok(t.includes('anon-test'));
});
test('erro interno não vaza detalhes', async () => {
  const s = setup(); s.db.select = async () => { throw Object.assign(new Error('senha=postgres://user:pw@host'), { code: 'XX000' }); };
  const r = await s.call('GET', '/api/products').then(s.j); assert.equal(r.status, 500); assert.ok(!JSON.stringify(r.body).includes('postgres://'));
});
