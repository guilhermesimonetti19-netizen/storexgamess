import { HttpError } from "./util.js";
import { paymentCheck } from "./infinitepay.js";

export async function logEvent(ctx, row) {
  try {
    await ctx.db.insert("payment_events", [row]);
    return true;
  } catch (e) {
    if (e.code === "23505") return false;
    console.error("payment_event_log_failed", e.code);
    return false;
  }
}

// Acha o pedido por qualquer identificador confiável (nosso ref, nosso order_nsu,
// order_nsu do provedor, transação ou fatura já gravadas).
async function findOrder(ctx, { ref, orderNsu, providerNsu, transactionNsu, slug }) {
  const tries = [
    ["public_ref", ref],
    ["order_nsu", orderNsu],
    ["order_nsu", providerNsu],
    ["transaction_nsu", transactionNsu],
    ["invoice_slug", slug],
  ];
  const seen = new Set();
  for (const [col, val] of tries) {
    if (!val || seen.has(col + val)) continue;
    seen.add(col + val);
    const { rows } = await ctx.db.select("orders", {
      filters: { [col]: "eq." + val },
      limit: 1,
    });
    if (rows[0]) return rows[0];
  }
  return null;
}

// Recupera o UUID do provedor + transaction_nsu de pedidos que ficaram pendentes,
// cruzando o evento "verify" (que tem o transaction_nsu) com o webhook rejeitado
// (que tem o order_nsu do provedor). Formato do id: order_nsu:transaction_nsu:resultado.
async function recoverProviderIds(ctx, order) {
  const { rows: ver } = await ctx.db.select("payment_events", {
    filters: { order_id: "eq." + order.id, source: "eq.verify" },
    order: "created_at.desc",
    limit: 20,
  });
  for (const e of ver) {
    const tx = String(e.provider_event_id).split(":")[1];
    if (!tx || tx === "none" || !/^[\w-]{8,80}$/.test(tx)) continue;
    const { rows: wh } = await ctx.db.select("payment_events", {
      filters: { provider_event_id: `ilike.*:${tx}:rejected_unknown_order` },
      limit: 1,
    });
    if (wh[0]) {
      const providerNsu = String(wh[0].provider_event_id).split(":")[0];
      if (providerNsu) return { providerNsu, transactionNsu: tx };
    }
  }
  return null;
}

// Núcleo: o pagamento só é aceito após consulta server-side à InfinitePay, com valor >= ao do pedido.
// Idempotente: evento repetido / pedido já pago não duplica nada.
export async function verifyAndApply(
  ctx,
  { ref, orderNsu, providerNsu, transactionNsu, slug, source },
) {
  const order = await findOrder(ctx, { ref, orderNsu, providerNsu, transactionNsu, slug });
  const baseId = order?.order_nsu ?? providerNsu ?? orderNsu ?? "unknown";
  const eid = (r) => `${baseId}:${transactionNsu || "none"}:${r}`;
  const ev = (result, extra = {}) => ({
    order_id: order?.id ?? null,
    provider_event_id: eid(result),
    source,
    event_type: "payment_check",
    validation_result: result,
    ...extra,
  });
  if (!order) {
    await logEvent(ctx, ev("rejected_unknown_order"));
    return { ok: false, permanent: true, reason: "unknown_order" };
  }
  if (order.payment_status === "paid")
    return { ok: true, duplicate: true, paid: true, order };
  if (order.payment_status === "refunded")
    return { ok: false, permanent: true, reason: "order_refunded", order };

  // Reconciliação de pedido antigo: recupera os IDs do provedor pelos eventos já gravados.
  if (source === "reconcile" && !providerNsu && !transactionNsu) {
    const rec = await recoverProviderIds(ctx, order);
    if (rec) {
      providerNsu = rec.providerNsu;
      transactionNsu = rec.transactionNsu;
    }
  }
  // Se o provedor devolveu o mesmo order_nsu que o nosso, não é preciso diferenciar.
  const checkProvider = providerNsu && providerNsu !== order.order_nsu ? providerNsu : null;

  let check;
  try {
    check = await paymentCheck(ctx.env, ctx.fetch, {
      orderNsu: order.order_nsu,
      providerNsu: checkProvider,
      transactionNsu,
      slug,
    });
  } catch {
    await logEvent(ctx, ev("error_provider_unreachable"));
    return { ok: false, permanent: false, reason: "provider_error", order };
  }
  if (!check.paid) {
    await logEvent(ctx, ev("not_paid", { status_received: "unpaid" }));
    return { ok: true, paid: false, order };
  }
  // Rejeita apenas pagamento MENOR que o pedido (a InfinitePay pode somar taxas do cliente).
  const got = check.amount ?? check.paidAmount;
  if (got === null || got === undefined || got < order.total_cents) {
    await logEvent(
      ctx,
      ev("rejected_amount_mismatch", { amount_cents: got ?? null, status_received: "paid" }),
    );
    console.error("payment_amount_mismatch", order.public_ref, got, order.total_cents);
    return { ok: false, permanent: true, reason: "amount_mismatch", order };
  }

  // Uma transação só pode confirmar UM pedido.
  if (transactionNsu) {
    const { rows: dup } = await ctx.db.select("orders", {
      filters: { transaction_nsu: "eq." + transactionNsu, id: "neq." + order.id },
      limit: 1,
    });
    if (dup[0]) {
      await logEvent(ctx, ev("rejected_duplicate_transaction", { amount_cents: got }));
      console.error("payment_duplicate_transaction", order.public_ref);
      return { ok: false, permanent: true, reason: "duplicate_transaction", order };
    }
  }

  await logEvent(ctx, ev("accepted", { amount_cents: check.amount, status_received: "paid" }));
  const patch = {
    payment_status: "paid",
    status: "paid",
    paid_at: ctx.now().toISOString(),
    payment_method: check.captureMethod,
    paid_amount_cents: check.paidAmount ?? check.amount,
    transaction_nsu: transactionNsu || null,
    invoice_slug: slug || null,
  };
  const filt = {
    id: "eq." + order.id,
    payment_status: "in.(pending,failed,expired,cancelled)",
  };
  let upd;
  try {
    upd = await ctx.db.update("orders", filt, patch);
  } catch (e) {
    console.error("order_paid_update_failed", e.code);
    await logEvent(ctx, ev("error_update", { amount_cents: check.amount }));
    // 23505 = transação/fatura já usada em outro pedido (não adianta reenviar)
    return { ok: false, permanent: e.code === "23505", reason: "update_failed", order };
  }
  if (!upd.length) return { ok: true, duplicate: true, paid: true, order };
  const { rows: items } = await ctx.db.select("order_items", {
    filters: { order_id: "eq." + order.id },
  });
  for (const i of items)
    if (i.track_stock && i.product_id)
      await ctx.db
        .rpc("decrement_stock", { p_product: i.product_id, p_qty: i.quantity })
        .catch(() => console.error("stock_update_failed"));
  return { ok: true, paid: true, order: upd[0] };
}

// Estorno: a InfinitePay não envia webhook de estorno; o admin registra após estornar no app deles.
export async function flagRefund(ctx, admin, orderId, justification) {
  if (typeof justification !== "string" || justification.trim().length < 10)
    throw new HttpError(422, "validation", "Informe uma justificativa (mín. 10 caracteres).");
  const { rows } = await ctx.db.select("orders", {
    filters: { id: "eq." + orderId },
    limit: 1,
  });
  if (!rows[0]) throw new HttpError(404, "not_found", "Pedido não encontrado.");
  if (rows[0].payment_status !== "paid")
    throw new HttpError(409, "conflict", "Só pedidos pagos podem ser marcados como estornados.");
  const [o] = await ctx.db.update(
    "orders",
    { id: "eq." + orderId, payment_status: "eq.paid" },
    {
      payment_status: "refunded",
      status: "refunded",
      delivery_status: "needs_review",
      refunded_at: ctx.now().toISOString(),
    },
  );
  await logEvent(ctx, {
    order_id: orderId,
    provider_event_id: `admin-refund:${orderId}`,
    source: "admin",
    event_type: "refund_flag",
    validation_result: "admin_exception",
    status_received: "refunded",
  });
  await audit(ctx, admin, "order.refund_flag", "order", orderId, {
    justification: justification.trim().slice(0, 500),
  });
  return o;
}

export async function audit(ctx, actor, action, entity, entityId, details) {
  try {
    await ctx.db.insert("audit_log", [
      {
        actor_id: actor?.id ?? null,
        action,
        entity,
        entity_id: entityId ? String(entityId) : null,
        details: details ?? null,
      },
    ]);
  } catch {
    console.error("audit_failed", action);
  }
}