import { readdirSync } from 'node:fs'; import { execFileSync } from 'node:child_process';
let bad = 0; for (const d of ['public/js', 'server', 'server/lib', 'api', 'functions/api']) for (const f of readdirSync(d)) if (f.endsWith('.js')) { try { execFileSync('node', ['--check', `${d}/${f}`], { stdio: 'pipe' }); } catch (e) { bad++; console.error('ERRO', d, f, String(e.stderr)); } }
console.log(bad ? `${bad} arquivo(s) com erro` : 'sintaxe OK'); process.exit(bad ? 1 : 0);
