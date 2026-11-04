import { bad } from './util.js';
export const COMBO_KEYS = ['combo_enabled', 'combo_qty', 'combo_unit_cents', 'combo_price_cents', 'combos_json'];
const ok = (q, u, p) => q >= 2 && q <= 10 && u > 0 && p > 0 && p < q * u;
export function comboConfig(s = {}) {
  const l = [], q = Number(s.combo_qty), u = Number(s.combo_unit_cents), p = Number(s.combo_price_cents);
  if (s.combo_enabled === '1' && ok(q, u, p)) l.push({ qty: q, unit: u, price: p });
  try { for (const c of JSON.parse(s.combos_json || '[]').slice(0, 20)) { const x = { qty: +c.qty, unit: +c.unit, price: +c.price }; if (c.on !== false && ok(x.qty, x.unit, x.price)) l.push(x); } } catch { /* ignora */ }
  return l;
}
export function normCombos(raw) {
  let a; try { a = JSON.parse(raw || '[]'); } catch { throw bad('Combos inválidos.'); }
  if (!Array.isArray(a) || a.length > 20) throw bad('Máximo de 20 combos adicionais.');
  return JSON.stringify(a.map(c => { const q = +c.qty, u = +c.unit, p = +c.price;
    if (!(Number.isInteger(q) && Number.isInteger(u) && Number.isInteger(p) && ok(q, u, p))) throw bad('Combo inválido: o preço do combo deve ser menor que quantidade × preço unitário.');
    return { name: String(c.name || '').slice(0, 40), qty: q, unit: u, price: p, on: c.on !== false }; }));
}
// lines: [{unit, quantity}]. Cada unidade entra em no máximo um combo (melhor desconto por unidade primeiro).
export function applyCombo(lines, cfgs) {
  const left = new Map(); for (const l of lines) left.set(l.unit, (left.get(l.unit) || 0) + l.quantity);
  const applied = []; let discount = 0;
  for (const c of [...(cfgs || [])].sort((a, b) => a.price / a.qty - b.price / b.qty)) {
    const n = left.get(c.unit) || 0, g = Math.floor(n / c.qty); if (!g) continue;
    left.set(c.unit, n - g * c.qty); applied.push({ ...c, groups: g }); discount += g * (c.qty * c.unit - c.price);
  }
  return { applied, discount };
}
// Itens enviados à InfinitePay: o desconto é diluído nas unidades dos combos (a soma bate com o total). Aceita snapshot antigo.
export function checkoutItems(items, snap) {
  const list = snap?.combos || (snap?.groups ? [snap] : []);
  const units = items.flatMap(i => Array.from({ length: i.quantity }, () => ({ name: i.name, unit: i.unit, p: i.unit, c: false })));
  for (const c of list) units.filter(u => u.unit === c.unit && !u.c).slice(0, c.groups * c.qty).forEach((u, k) => { u.p = Math.floor(c.price / c.qty) + (k % c.qty < c.price % c.qty ? 1 : 0); u.c = true; });
  const m = new Map();
  for (const u of units) { const d = u.c ? u.name + ' (combo)' : u.name, k = u.p + '|' + d, e = m.get(k); e ? e.quantity++ : m.set(k, { quantity: 1, price: u.p, description: d }); }
  return [...m.values()];
}