// Integração InfinitePay — Checkout Integrado
const BASE = "https://api.checkout.infinitepay.io";

export const isConfigured = (env) => Boolean(env.INFINITEPAY_HANDLE);

export async function createCheckoutLink(
  env,
  fetchImpl,
  { orderNsu, items, redirectUrl, webhookUrl },
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
      description: i.description.slice(0, 120),
    })),
  };

  // Com API key: não pedir endereço de entrega (produto digital).
  if (key) {
    payload.options = {
      require_delivery_address: false,
    };
  }

  // Diagnóstico (sem segredos: a URL do webhook tem o segredo, por isso não é logada)
  console.info("infinitepay_checkout_request", {
    order_nsu: payload.order_nsu,
    handle_configured: Boolean(payload.handle),
    api_key_configured: Boolean(key),
    items: payload.items,
  });

  const res = await fetchImpl(`${BASE}/links`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(key ? { "X-Api-Key": key } : {}),
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    console.error("infinitepay_checkout_http_error", {
      status: res.status,
      order_nsu: orderNsu,
    });
    throw new Error("infinitepay_links_" + res.status);
  }

  const data = await res.json().catch(() => ({}));

  console.info("infinitepay_checkout_response", {
    requested_order_nsu: orderNsu,
    response_keys: Object.keys(data),
    response_order_nsu: data.order_nsu ?? null,
    invoice_slug: data.invoice_slug ?? null,
    slug: data.slug ?? null,
    url_received: Boolean(data.url || data.checkout_url),
  });

  const url = data.url || data.checkout_url;

  if (
    typeof url !== "string" ||
    !/^https:\/\/([a-z0-9-]+\.)*infinitepay\.(io|com\.br)\//i.test(url)
  ) {
    console.error("infinitepay_bad_checkout_url", {
      requested_order_nsu: orderNsu,
      response_keys: Object.keys(data),
    });
    throw new Error("infinitepay_bad_url");
  }

  return url;
}

// Verificação do pagamento.
// providerNsu = order_nsu que a InfinitePay devolveu (com API key ela gera um UUID próprio).
// Tenta primeiro com o order_nsu do provedor; se não confirmar, tenta com o nosso.
export async function paymentCheck(
  env,
  fetchImpl,
  { orderNsu, providerNsu, transactionNsu, slug },
) {
  const mk = (nsu) => {
    const b = { handle: env.INFINITEPAY_HANDLE, order_nsu: nsu };
    if (transactionNsu) b.transaction_nsu = transactionNsu;
    if (slug) b.slug = slug;
    return b;
  };
  const attempts = [mk(providerNsu || orderNsu)];
  if (providerNsu && providerNsu !== orderNsu) attempts.push(mk(orderNsu));

  const key = env.INFINITEPAY_API_KEY;
  const post = (body, k) =>
    fetchImpl(`${BASE}/payment_check`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(k ? { "X-Api-Key": k } : {}),
      },
      body: JSON.stringify(body),
    });

  let last = null;
  let lastErr = null;
  for (const body of attempts) {
    let res = await post(body, key);
    // Se a key for rejeitada, tenta sem ela.
    if (key && [400, 401, 403].includes(res.status)) {
      console.error("infinitepay_check_with_key_rejected", res.status);
      res = await post(body, null);
    }
    const d = await res.json().catch(() => ({}));
    console.info("infinitepay_payment_check", {
      http_status: res.status,
      sent_keys: Object.keys(body),
      sent_order_nsu_is_ours: body.order_nsu === orderNsu,
      resp_success: d.success ?? null,
      resp_paid: d.paid ?? null,
      resp_keys: Object.keys(d),
    });
    if (!res.ok) {
      lastErr = new Error("infinitepay_check_" + res.status);
      continue;
    }
    last = d;
    if (d.success !== false && d.paid === true) break;
  }
  if (!last) throw lastErr || new Error("infinitepay_check_failed");

  const d = last;
  return {
    paid: d.success !== false && d.paid === true,
    amount: Number.isFinite(Number(d.amount)) ? Number(d.amount) : null,
    paidAmount: Number.isFinite(Number(d.paid_amount))
      ? Number(d.paid_amount)
      : null,
    captureMethod:
      typeof d.capture_method === "string"
        ? d.capture_method.slice(0, 30)
        : null,
  };
}
