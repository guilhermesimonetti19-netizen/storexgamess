import test from 'node:test'; import assert from 'node:assert/strict'; import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'; import path from 'node:path';
const walk = d => readdirSync(d).flatMap(f => { const p = path.join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const pub = walk('public').filter(f => /\.(js|html|css|svg|txt)$/.test(f));
test('frontend não contém segredos nem nomes de variáveis secretas', () => { for (const f of pub) { const t = readFileSync(f, 'utf8'); assert.ok(!/SERVICE_ROLE|service_role|WEBHOOK_SECRET|INFINITEPAY_API/i.test(t), f); } });
test('frontend sem innerHTML/eval/document.write (anti-XSS)', () => { for (const f of pub.filter(f => f.endsWith('.js'))) { const t = readFileSync(f, 'utf8'); assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function|document\.write/.test(t), f); } });
test('index.html sem script/estilo inline (compatível com a CSP)', () => { const t = readFileSync('public/index.html', 'utf8'); assert.ok(!/<script(?![^>]*src=)/.test(t)); assert.ok(!/<style|style=|onclick=/.test(t)); });
test('.env.example sem valores reais e .env ignorado pelo Git', () => { assert.match(readFileSync('.env.example', 'utf8'), /COLE_AQUI/); assert.ok(readFileSync('.gitignore', 'utf8').includes('.env')); assert.ok(!existsSync('.env')); });
test('SQL: toda tabela criada tem RLS habilitado e nenhuma política para anon/authenticated', () => {
  const sql = walk('supabase/migrations').map(f => readFileSync(f, 'utf8')).join('\n');
  const created = [...sql.matchAll(/create table if not exists public\.(\w+)/g)].map(m => m[1]); const rls = [...sql.matchAll(/alter table public\.(\w+)\s+enable row level security/g)].map(m => m[1]);
  assert.ok(created.length >= 12); for (const t of created) assert.ok(rls.includes(t), 'sem RLS: ' + t);
  assert.ok(!/create policy/i.test(sql), 'não deve haver políticas abertas'); assert.match(sql, /revoke all on all tables\s+in schema public from anon, authenticated/);
});
test('SQL: instruções pós-compra ficam fora da view pública e da tabela products', () => { const sql = readFileSync('supabase/migrations/001_schema.sql', 'utf8'); const view = sql.slice(sql.indexOf('create or replace view public.catalog_products')); assert.ok(!/instructions|product_delivery/.test(view.slice(0, view.indexOf('-- ===== Pedidos')))); });
test('SQL: role protegido por trigger e único admin', () => { const sql = readFileSync('supabase/migrations/001_schema.sql', 'utf8'); assert.match(sql, /protect_profile_role/); assert.match(sql, /profiles_single_admin/); assert.ok(!/insert into auth\.users|crypt\(/i.test(sql), 'sem admin/senha padrão'); });
test('valores monetários são inteiros em centavos no esquema', () => { const sql = readFileSync('supabase/migrations/001_schema.sql', 'utf8'); assert.ok(!/numeric|float|double precision|money/i.test(sql)); });
test('frontend sem emojis (ícones são SVG) e imagens referenciadas existem', () => {
  const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B50}]/u;
  for (const f of walk('public').filter(f => /\.(js|html|css)$/.test(f))) assert.ok(!emoji.test(readFileSync(f, 'utf8')), 'emoji em ' + f);
  const used = new Set(); for (const f of walk('public').filter(f => /\.(js|html)$/.test(f))) for (const m of readFileSync(f, 'utf8').matchAll(/\/assets\/([\w.-]+\.(?:webp|png))/g)) used.add(m[1]);
  for (const a of used) assert.ok(existsSync('public/assets/' + a), 'asset ausente: ' + a);
});
