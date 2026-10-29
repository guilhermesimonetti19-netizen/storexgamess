// Carrinho temporário (conveniência). O PREÇO e o total finais são sempre recalculados no servidor.
const KEY = 'sx_cart';
export const getCart = () => { try { const c = JSON.parse(localStorage.getItem(KEY)); return Array.isArray(c) ? c.filter(i => typeof i?.id === 'string' && Number.isInteger(i.qty) && i.qty > 0 && i.qty <= 10) : []; } catch { return []; } };
const save = c => { try { localStorage.setItem(KEY, JSON.stringify(c)); } catch { /* ignora */ } window.dispatchEvent(new Event('cart')); };
export const cartCount = () => getCart().reduce((n, i) => n + i.qty, 0);
export function addToCart(id, qty = 1, max = 10) { const c = getCart(); const i = c.find(x => x.id === id); if (i) i.qty = Math.min(max, i.qty + qty); else c.push({ id, qty: Math.min(max, qty) }); save(c); }
export function setQty(id, qty) { save(getCart().map(i => (i.id === id ? { ...i, qty } : i)).filter(i => i.qty > 0)); }
export const removeItem = id => save(getCart().filter(i => i.id !== id));
export const clearCart = () => save([]);
export function idempotencyKey() { // estável enquanto o carrinho não muda → clique duplo não cria dois pedidos
  const sig = JSON.stringify(getCart().slice().sort((a, b) => a.id.localeCompare(b.id))); let s = null;
  try { s = JSON.parse(sessionStorage.getItem('sx_idem')); } catch { /* */ }
  if (s?.sig === sig) return s.key; const key = crypto.randomUUID().replace(/-/g, '');
  try { sessionStorage.setItem('sx_idem', JSON.stringify({ sig, key })); } catch { /* */ } return key;
}
