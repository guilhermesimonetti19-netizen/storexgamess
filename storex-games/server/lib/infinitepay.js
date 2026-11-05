// Integração InfinitePay — Checkout Integrado
const BASE = 'https://api.checkout.infinitepay.io';

export const isConfigured = (env) => Boolean(env.INFINITEPAY_HANDLE);

export async function createCheckoutLink(
  env,
  fetchImpl,
  { orderNsu, items, redirectUrl, webhookUrl }
) {
  const key = env.INFINITEPAY_API_KEY;

  const payload = {
    handle: env.INFINITEPAY_HANDLE,
    order_nsu: orderNsu,
    redirect_url: redirectUrl,
    webhook_url: webhookUrl,
    items: items.map((i) => ({
      quantity: i.quantity,
      price: i.price,
      description: i.description.slice(0, 120)
    }))
  };

  console.info('infinitepay_checkout_request', {
    order_nsu: payload.order_nsu,
    handle_configured: Boolean(payload.handle),
    api_key_configured: Boolean(key),
    items: payload.items
  });

  const res = await fetchImpl(`${BASE}/links`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(key ? { 'X-Api-Key': key } : {})
    },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    console.error('infinitepay_checkout_http_error', {
      status: res.status,
      order_nsu: orderNsu
    });
    throw new Error('infinitepay_links_' + res.status);
  }

  const data = await res.json().catch(() => ({}));

  console.info('infinitepay_checkout_response', {
    requested_order_nsu: orderNsu,
    response_keys: Object.keys(data),
    response_order_nsu: data.order_nsu ?? null,
    invoice_slug: data.invoice_slug ?? null,
    slug: data.slug ?? null,
    url_received: Boolean(data.url || data.checkout_url)
  });

  const url = data.url || data.checkout_url;

  if (
    typeof url !== 'string' ||
    !/^https:\/\/([a-z0-9-]+\.)*infinitepay\.(io|com\.br)\//i.test(url)
  ) {
    console.error('infinitepay_bad_checkout_url', {
      requested_order_nsu: orderNsu,
      response_keys: Object.keys(data)
    });
    throw new Error('infinitepay_bad_url');
  }

  return url;
}

// Verificação do pagamento.
// providerNsu = order_nsu que a InfinitePay devolveu (com API key ela gera um UUID próprio).
// Se não vier, usa o nosso orderNsu (fluxo antigo).
export async function paymentCheck(
  env,
  fetchImpl,
  { orderNsu, providerNsu, transactionNsu, slug }
) {
  const body = {
    handle: env.INFINITEPAY_HANDLE,
    order_nsu: providerNsu || orderNsu
  };
  if (transactionNsu) body.transaction_nsu = transactionNsu;
  if (slug) body.slug = slug;

  const call = (key) =>
    fetchImpl(`${BASE}/payment_check`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(key ? { 'X-Api-Key': key } : {})
      },
      body: JSON.stringify(body)
    });

  const key = env.INFINITEPAY_API_KEY;
  let res = await call(key);

  // Se a key for rejeitada, tenta sem ela (a doc pública não exige key neste endpoint).
  if (key && [400, 401, 403].includes(res.status)) {
    console.error('infinitepay_check_with_key_rejected', res.status);
    res = await call(null);
  }

  if (!res.ok) throw new Error('infinitepay_check_' + res.status);

  const d = await res.json().catch(() => ({}));

  return {
    paid: d.success !== false && d.paid === true,
    amount: Number.isFinite(Number(d.amount)) ? Number(d.amount) : null,
    paidAmount: Number.isFinite(Number(d.paid_amount)) ? Number(d.paid_amount) : null,
    captureMethod:
      typeof d.capture_method === 'string' ? d.capture_method.slice(0, 30) : null
  };
}