import { createApp } from '../../server/router.js';
import { createFakeDb, catalogView } from './fakedb.js';
import { _resetRateLimit } from '../../server/lib/util.js';
export const ENV = { SUPABASE_URL: 'https://fake.supabase.co', SUPABASE_ANON_KEY: 'anon-test', SUPABASE_SERVICE_ROLE_KEY: 'service-test-SECRET', APP_BASE_URL: 'http://localhost:3000', INFINITEPAY_HANDLE: 'loja_teste', WEBHOOK_SECRET: 'whsec-test' };
export const U = { admin: { id: '11111111-1111-4111-8111-111111111111', email: 'admin@teste.dev' }, a: { id: '22222222-2222-4222-8222-222222222222', email: 'a@teste.dev' }, b: { id: '33333333-3333-4333-8333-333333333333', email: 'b@teste.dev' }, unverified: { id: '44444444-4444-4444-8444-444444444444', email: 'u@teste.dev', unconfirmed: true } };
const P1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1', P2 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2', P3 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3';
export const PID = { P1, P2, P3 };
export function setup({ env = {}, extraFetch } = {}) {
  _resetRateLimit();
  const e = { ...ENV, ...env };
  const db = createFakeDb({
    categories: [{ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', name: 'Jogos PC', slug: 'jogos-pc-steam', is_active: true }],
    profiles: [{ id: U.admin.id, role: 'admin' }, { id: U.a.id, role: 'customer' }, { id: U.b.id, role: 'customer' }],
    products: [
      { id: P1, slug: 'jogo-teste-1', name: '[DEMO] Jogo Teste 1', category_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', price_cents: 10000, promo_price_cents: 7990, is_active: true, track_stock: false, max_per_order: 1, platform: 'Steam', created_at: '2026-01-01T00:00:00Z' },
      { id: P2, slug: 'jogo-teste-2', name: '[DEMO] Jogo Teste 2', category_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', price_cents: 5990, is_active: true, track_stock: true, stock: 2, max_per_order: 3, platform: 'Xbox', created_at: '2026-02-01T00:00:00Z' },
      { id: P3, slug: 'inativo', name: '[DEMO] Inativo', category_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', price_cents: 1000, is_active: false, track_stock: false, max_per_order: 1, created_at: '2026-03-01T00:00:00Z' },
    ],
    product_delivery: [{ product_id: P1, instructions: 'SEGREDO-INSTRUCOES-P1', eta_text: '1h' }, { product_id: P2, instructions: 'SEGREDO-INSTRUCOES-P2' }],
    store_settings: [{ key: 'whatsapp_number', value: '5511999999999' }, { key: 'whatsapp_message', value: 'Olá! Pedido #{pedido}' }, { key: 'store_name', value: 'StoreX Games' }],
  }, { views: { catalog_products: catalogView } });
  const log = { ip: [] }; const state = { paid: true, amount: null, ipDown: false };
  const fetchImpl = async (url, init = {}) => {
    url = String(url); const hdr = init.headers || {}; const auth = hdr.Authorization || '';
    if (url.endsWith('/auth/v1/user')) { const tok = auth.replace('Bearer ', ''); const u = Object.values(U).find(x => 'tok-' + x.id === tok); return u ? Response.json({ id: u.id, email: u.email, email_confirmed_at: u.unconfirmed ? null : '2026-01-01' }) : new Response('{}', { status: 401 }); }
    if (url.endsWith('/links')) { log.ip.push(['links', JSON.parse(init.body)]); return state.ipDown ? new Response('x', { status: 500 }) : Response.json({ url: 'https://checkout.infinitepay.io/loja_teste/abc123' }); }
    if (url.endsWith('/payment_check')) { const b = JSON.parse(init.body); log.ip.push(['check', b]); if (state.ipDown) return new Response('x', { status: 500 }); return Response.json({ success: true, paid: state.paid, amount: state.amount ?? state.orderTotal(b.order_nsu), paid_amount: (state.amount ?? state.orderTotal(b.order_nsu)) + 50, capture_method: 'pix' }); }
    if (url.includes('/storage/v1/object/')) { log.ip.push(['storage', init.method, url]); return new Response('{}', { status: 200 }); }
    if (extraFetch) return extraFetch(url, init); throw new Error('fetch inesperado: ' + url);
  };
  state.orderTotal = nsu => db.t.orders.find(o => o.order_nsu === nsu)?.total_cents ?? 0;
  const app = createApp({ env: e, db, fetchImpl });
  const call = (method, path, { user, body, headers = {}, raw } = {}) => app(new Request('http://localhost:3000' + path, { method, headers: { ...(user ? { Authorization: 'Bearer tok-' + user.id } : {}), ...(raw ? {} : body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: ['GET','HEAD'].includes(method) ? undefined : (raw ?? (body !== undefined ? JSON.stringify(body) : undefined)) }));
  const j = async r => ({ status: r.status, body: await r.clone().json().catch(() => null), res: r });
  return { db, call, j, log, state, env: e, app };
}
