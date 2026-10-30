export const PUBLIC_SETTING_KEYS = ['store_name', 'whatsapp_number', 'whatsapp_message', 'support_text', 'instagram_url', 'combo_enabled', 'combo_qty', 'combo_unit_cents', 'combo_price_cents'];
export const ALL_SETTING_KEYS = [...PUBLIC_SETTING_KEYS, 'alert_pending_hours', 'alert_low_stock'];
export async function loadSettings(db, keys = ALL_SETTING_KEYS) {
  const { rows } = await db.select('store_settings', { filters: { key: `in.(${keys.join(',')})` } });
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}
export function waLink(settings, orderRef, productNames = []) {
  const num = String(settings.whatsapp_number || '').replace(/\D/g, '');
  if (num.length < 10) return null;
  let msg = (settings.whatsapp_message || 'Olá! Fiz o pedido #{pedido}.').replace('{pedido}', orderRef);
  if (productNames.length) msg += ` Produto: ${productNames.slice(0, 3).join(', ')}.`;
  return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`;
}
