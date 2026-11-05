// Integração InfinitePay (Checkout Integrado) — conforme a documentação pública:
//  POST https://api.checkout.infinitepay.io/links           (cria link)
//  POST https://api.checkout.infinitepay.io/payment_check   (confere pagamento)
// A API Key deve ser enviada no header X-Api-Key tanto na criação do link (options) quanto no payment_check.
const BASE = 'https://api.checkout.infinitepay.io';
export const isConfigured = env => Boolean(env.INFINITEPAY_HANDLE);

export async function createCheckoutLink(env, fetchImpl, { orderNsu, items, redirectUrl, webhookUrl }) {
  const key = env.INFINITEPAY_API_KEY;
  const payload = {
    handle: env.INFINITEPAY_HANDLE, order_nsu: orderNsu, redirect_url: redirectUrl, webhook_url: webhookUrl,
    items: items.map(i => ({ quantity: i.quantity, price: i.price, description: i.description.slice(0, 120) })), // price em centavos
  };
  if (key) payload.options = { require_delivery_address: false }; // exige X-Api-Key
  const res = await fetchImpl(`${BASE}/links`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key ? { 'X-Api-Key': key } : {}) },
    body: JSON.stringify(payload) });
  if (!res.ok) throw new Error('infinitepay_links_' + res.status);
  const data = await res.json().catch(() => ({}));
  const url = data.url || data.checkout_url;
  if (typeof url !== 'string' || !/^https:\/\/([a-z0-9-]+\.)*infinitepay\.(io|com\.br)\//i.test(url)) throw new Error('infinitepay_bad_url');
  return url;
}

// Retorna { paid:boolean, amount:number|null, paidAmount:number|null, captureMethod }. Lança erro em falha de rede/HTTP.
export async function paymentCheck(env, fetchImpl, { orderNsu, transactionNsu, slug }) {
  const body = { handle: env.INFINITEPAY_HANDLE, order_nsu: orderNsu };
  if (transactionNsu) body.transaction_nsu = transactionNsu;
  if (slug) body.slug = slug;
  const res = await fetchImpl(`${BASE}/payment_check`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(env.INFINITEPAY_API_KEY ? { 'X-Api-Key': env.INFINITEPAY_API_KEY } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('infinitepay_check_' + res.status);
  const d = await res.json().catch(() => ({}));
  return { paid: d.success !== false && d.paid === true, amount: Number.isFinite(Number(d.amount)) ? Number(d.amount) : null,
    paidAmount: Number.isFinite(Number(d.paid_amount)) ? Number(d.paid_amount) : null, captureMethod: typeof d.capture_method === 'string' ? d.capture_method.slice(0, 30) : null };
}