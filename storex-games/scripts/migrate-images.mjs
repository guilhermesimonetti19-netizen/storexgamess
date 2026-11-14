// Migra as imagens JÁ cadastradas: redimensiona (máx. 1000 px), converte para WebP q85
// e reenvia com cache-control de 1 ano. Atualiza product_images.path.
// Uso (raiz do projeto, com .env preenchido):
//   npm i --no-save sharp
//   node scripts/migrate-images.mjs --dry          (só simula e mostra a economia)
//   node scripts/migrate-images.mjs                (executa; mantém os originais)
//   node scripts/migrate-images.mjs --delete-old   (executa e apaga os originais)
// Pode ser interrompido e rodado de novo: o progresso fica em migrated.json.
import sharp from 'sharp';
import { randomBytes } from 'node:crypto';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';

if (existsSync('.env')) for (const l of readFileSync('.env', 'utf8').split('\n')) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !l.trim().startsWith('#')) process.env[m[1]] ??= m[2];
}
const URL_ = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
if (!URL_ || !KEY) throw new Error('Preencha SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env');
const auth = { apikey: KEY, ...(KEY.startsWith('eyJ') ? { Authorization: 'Bearer ' + KEY } : {}) };
const DRY = process.argv.includes('--dry'), DEL = process.argv.includes('--delete-old');
const DONE_FILE = 'migrated.json';
const done = new Set(existsSync(DONE_FILE) ? JSON.parse(readFileSync(DONE_FILE, 'utf8')) : []);

const r = await fetch(`${URL_}/rest/v1/product_images?select=id,product_id,path,size_bytes,mime_type&limit=5000`, { headers: auth });
if (!r.ok) throw new Error('Falha ao listar imagens: HTTP ' + r.status);
const rows = await r.json();
console.log(rows.length, 'imagens no banco;', done.size, 'já migradas');
let before = 0, after = 0, ok = 0, fail = 0;

for (const row of rows) {
  if (done.has(row.id)) continue;
  try {
    const src = await fetch(`${URL_}/storage/v1/object/public/product-images/${row.path}`);
    if (!src.ok) { console.warn('pulou (download)', row.path, src.status); fail++; continue; }
    const buf = Buffer.from(await src.arrayBuffer());
    const meta = await sharp(buf).metadata();
    let out = buf;
    // WebP já pequeno e no tamanho certo não é recomprimido (evita perda dupla de qualidade).
    if (!(meta.format === 'webp' && buf.length <= 200_000 && (meta.width || 0) <= 1000)) {
      const c = await sharp(buf).rotate().resize({ width: 1000, withoutEnlargement: true }).webp({ quality: 85 }).toBuffer();
      if (c.length < buf.length || meta.format !== 'webp') out = c;
    }
    before += buf.length; after += out.length;
    console.log(row.path, '-', Math.round(buf.length / 1024), 'KB ->', Math.round(out.length / 1024), 'KB');
    if (DRY) continue;

    const np = `${row.product_id}/${randomBytes(12).toString('hex')}.webp`;
    const up = await fetch(`${URL_}/storage/v1/object/product-images/${np}`, {
      method: 'POST', body: out,
      headers: { ...auth, 'Content-Type': 'image/webp', 'cache-control': 'max-age=31536000', 'x-upsert': 'false' },
    });
    if (!up.ok) { console.warn('falha no upload', np, up.status); fail++; continue; }
    const pr = await fetch(`${URL_}/rest/v1/product_images?id=eq.${row.id}`, {
      method: 'PATCH', headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: np, mime_type: 'image/webp', size_bytes: out.length }),
    });
    if (!pr.ok) { console.warn('falha ao atualizar o banco', row.id, pr.status); fail++; continue; }
    if (DEL) await fetch(`${URL_}/storage/v1/object/product-images/${row.path}`, { method: 'DELETE', headers: auth });
    done.add(row.id); ok++;
    writeFileSync(DONE_FILE, JSON.stringify([...done]));
  } catch (e) { console.warn('erro', row.path, e.message); fail++; }
}
console.log(`\nTotal: ${(before / 1048576).toFixed(1)} MB -> ${(after / 1048576).toFixed(1)} MB | migradas: ${ok} | falhas: ${fail}${DRY ? ' (simulação)' : ''}`);
