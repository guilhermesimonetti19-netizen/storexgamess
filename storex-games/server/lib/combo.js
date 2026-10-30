export const COMBO_KEYS = ['combo_enabled', 'combo_qty', 'combo_unit_cents', 'combo_price_cents'];
export function comboConfig(s = {}) {
  const qty = Number(s.combo_qty), unit = Number(s.combo_unit_cents), price = Number(s.combo_price_cents);
  return s.combo_enabled === '1' && qty >= 2 && qty <= 10 && unit > 0 && price > 0 && price < qty * unit ? { qty, unit, price } : null;
}
export function applyCombo(lines, cfg) { // lines: [{unit, quantity}]
  if (!cfg) return { groups: 0, discount: 0 };
  const n = lines.filter(l => l.unit === cfg.unit).reduce((a, l) => a + l.quantity, 0);
  const groups = Math.floor(n / cfg.qty);
  return { groups, discount: groups * (cfg.qty * cfg.unit - cfg.price) };
}
// Itens enviados à InfinitePay: o desconto é diluído nas unidades do combo, então a soma bate com o total do pedido.
export function checkoutItems(items, snap) { // items: [{name, unit, quantity}]
  const plain = i => ({ quantity: i.quantity, price: i.unit, description: i.name });
  if (!snap?.groups) return items.map(plain);
  const { qty, unit, price, groups } = snap, base = Math.floor(price / qty), rem = price % qty;
  let k = 0, left = groups * qty; const out = [];
  for (const i of items) {
    if (i.unit !== unit) { out.push(plain(i)); continue; }
    const m = new Map();
    for (let j = 0; j < i.quantity; j++) {
      let p = unit;
      if (left > 0) { p = base + (k % qty < rem ? 1 : 0); left--; k++; }
      m.set(p, (m.get(p) || 0) + 1);
    }
    for (const [p, q] of m) out.push({ quantity: q, price: p, description: p === unit ? i.name : i.name + ' (combo)' });
  }
  return out;
}