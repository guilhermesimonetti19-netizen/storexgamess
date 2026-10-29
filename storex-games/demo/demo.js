// MODO DEMONSTRAÇÃO: sobe a loja com produtos FICTÍCIOS e um "Supabase de mentira" local (somente leitura).
// Serve para ver o visual sem configurar nada. Login/compra NÃO funcionam aqui. Uso: npm run demo
import http from 'node:http'; import { readFile } from 'node:fs/promises'; import path from 'node:path'; import { fileURLToPath } from 'node:url'; import { spawn } from 'node:child_process';
import { createFakeDb, catalogView } from '../tests/helpers/fakedb.js';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const C = { v: 'c0000000-0000-4000-8000-000000000001', p: 'c0000000-0000-4000-8000-000000000002', k: 'c0000000-0000-4000-8000-000000000003' };
const P = (n, name, cat, plat, price, o = {}) => ({ id: `d0000000-0000-4000-8000-00000000000${n}`, slug: name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\[demo\]\s*/, 'demo-').replace(/[^a-z0-9]+/g, '-').replace(/-$/, ''), name, short_description: 'Produto fictício de demonstração para testar o visual da loja.', long_description: 'Texto de exemplo.\nEste produto não existe: serve apenas para pré-visualizar o layout.', category_id: cat, platform: plat, price_cents: price, is_active: true, track_stock: false, max_per_order: 1, created_at: `2026-0${n}-01T00:00:00Z`, ...o });
const products = [P(1, '[DEMO] Aventura Épica', C.p, 'Steam', 12990, { promo_price_cents: 8990, is_featured: true, is_new: true }), P(2, '[DEMO] Corrida Neon', C.v, 'Xbox', 6990, { is_featured: true }), P(3, '[DEMO] Mundo Aberto', C.p, 'Steam', 19990, { is_new: true }), P(4, '[DEMO] Pack Streaming', C.k, 'Assinatura', 2990, { is_featured: true }), P(5, '[DEMO] Curso de Edição', C.k, 'Curso', 4990, { is_new: true }), P(6, '[DEMO] Shooter Tático', C.v, 'Xbox', 14990, { promo_price_cents: 9990, track_stock: true, stock: 0 }), P(7, '[DEMO] Estratégia Total', C.p, 'Steam', 5990), P(8, '[DEMO] Pack Ferramentas IA', C.k, 'Assinatura', 3990, { is_featured: true })];
const db = createFakeDb({
  categories: [{ id: C.v, name: 'Jogos para videogames', slug: 'jogos-videogames', description: 'Xbox e outras plataformas compatíveis.', is_active: true, position: 1 }, { id: C.p, name: 'Jogos para PC / Steam', slug: 'jogos-pc-steam', description: 'Jogos digitais para PC.', is_active: true, position: 2 }, { id: C.k, name: 'Packs, assinaturas e serviços digitais', slug: 'packs-assinaturas', description: 'Packs, assinaturas e ferramentas.', is_active: true, position: 3 }],
  products, product_images: products.map((p, i) => ({ id: 'i' + i, product_id: p.id, path: `c${i + 1}.webp`, position: 0 })),
  store_settings: [{ key: 'store_name', value: 'StoreX Games' }, { key: 'whatsapp_number', value: '5511999999999' }, { key: 'whatsapp_message', value: 'Olá!' }, { key: 'support_text', value: 'Atendimento via WhatsApp após a confirmação do pagamento.' }, { key: 'instagram_url', value: '' }],
  pages: [{ slug: 'termos', title: 'Termos de Uso e Compra', body: '[MODELO] Texto de exemplo.' }, { slug: 'privacidade', title: 'Política de Privacidade', body: '[MODELO] Texto de exemplo.' }, { slug: 'entrega', title: 'Entrega Digital', body: '[MODELO]' }, { slug: 'reembolso', title: 'Reembolso', body: '[MODELO]' }, { slug: 'contato', title: 'Contato', body: '[MODELO]' }],
}, { views: { catalog_products: catalogView } });
const mock = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'); const send = (c, b, h = {}) => { res.writeHead(c, { 'Content-Type': 'application/json', ...h }); res.end(JSON.stringify(b)); };
  let m;
  if ((m = u.pathname.match(/^\/storage\/v1\/object\/public\/product-images\/(c\d\.webp)$/))) { res.writeHead(200, { 'Content-Type': 'image/webp' }); return res.end(await readFile(path.join(root, 'demo/covers', m[1]))); }
  if ((m = u.pathname.match(/^\/rest\/v1\/(\w+)$/)) && req.method === 'GET') {
    const f = {}, o = {}; for (const [k, v] of u.searchParams) { if (['select', 'order', 'limit', 'offset'].includes(k)) o[k] = v; else f[k] = v; }
    const r = await db.select(m[1], { filters: f, order: o.order, limit: o.limit ? Number(o.limit) : undefined, offset: Number(o.offset) || 0, count: true });
    return send(200, r.rows, { 'Content-Range': `0-${Math.max(0, r.rows.length - 1)}/${r.count}` });
  }
  send(401, { message: 'demo' });
}).listen(0, '127.0.0.1', () => {
  const port = process.env.PORT || 3000, url = `http://127.0.0.1:${mock.address().port}`;
  console.log(`\nMODO DEMO (dados fictícios, só leitura): http://localhost:${port}\n`);
  spawn(process.execPath, [path.join(root, 'server/dev.js')], { stdio: 'inherit', env: { ...process.env, PORT: String(port), SUPABASE_URL: url, SUPABASE_ANON_KEY: 'demo', SUPABASE_SERVICE_ROLE_KEY: 'demo', APP_BASE_URL: `http://localhost:${port}` } });
});
