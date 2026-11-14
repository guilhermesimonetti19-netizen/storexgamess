// Aplica as correções de imagem (cache de 1 ano + compressão WebP no navegador).
// Uso (na raiz do projeto):  node scripts/apply-fix.mjs
// Cria backup .bak, confere que cada trecho existe UMA vez e é seguro rodar de novo.
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';

const SHRINK = `// Reduz a imagem no navegador: máx. 1000 px de largura, WebP qualidade 85 (visualmente igual na loja).
    async function shrink(file, maxW = 1000, q = 0.85) {
      try {
        const bmp = await createImageBitmap(file);
        const k = Math.min(1, maxW / bmp.width);
        const w = Math.round(bmp.width * k), hh = Math.round(bmp.height * k);
        const c = document.createElement('canvas'); c.width = w; c.height = hh;
        c.getContext('2d').drawImage(bmp, 0, 0, w, hh);
        const blob = await new Promise(r => c.toBlob(r, 'image/webp', q));
        if (!blob || blob.type !== 'image/webp' || blob.size >= file.size) return file;
        return new File([blob], 'img.webp', { type: 'image/webp' });
      } catch { return file; }
    }
    `;

const plan = [
  {
    file: 'server/router.js',
    done: 'max-age=31536000',
    edits: [
      { re: /(["']x-upsert["']:\s*["']false["'])/, to: () => '"x-upsert": "false", "cache-control": "max-age=31536000"' },
    ],
  },
  {
    file: 'public/js/admin.js',
    done: 'async function shrink(',
    edits: [
      { re: /async function addFile\(file\) \{/, to: () => SHRINK + 'async function addFile(file) {' },
      {
        re: /if \(file\.size > 2 \* 1024 \* 1024\) return toast\('Máximo 2 MB\.', 'err'\);/,
        to: () => "file = await shrink(file);\n      if (file.size > 2 * 1024 * 1024) return toast('Máximo 2 MB após a compressão.', 'err');",
      },
    ],
  },
];

let failed = false;
for (const p of plan) {
  if (!existsSync(p.file)) { console.error('NÃO ACHEI', p.file, '- rode na raiz do projeto'); failed = true; continue; }
  let src = readFileSync(p.file, 'utf8');
  if (src.includes(p.done)) { console.log('já aplicado:', p.file); continue; }
  for (const e of p.edits) {
    const n = [...src.matchAll(new RegExp(e.re.source, 'g'))].length;
    if (n !== 1) { console.error(`ERRO em ${p.file}: trecho ${e.re} encontrado ${n}x (esperado 1). Nada foi alterado neste arquivo.`); failed = true; src = null; break; }
    src = src.replace(e.re, e.to);
  }
  if (src === null) continue;
  copyFileSync(p.file, p.file + '.bak');
  writeFileSync(p.file, src);
  console.log('corrigido:', p.file, '(backup em ' + p.file + '.bak)');
}
process.exit(failed ? 1 : 0);
