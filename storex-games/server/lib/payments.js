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

// Núcleo: o pagamento só é aceito após consulta server-side à InfinitePay, com valor igual ao do pedido.
// Idempotente: evento repetido / pedido já pago não duplica nada.
export async function verifyAndApply(
  ctx,
  { orderNsu, transactionNsu, slug, source },
) {
  const { rows } = await ctx.db.select("orders", {
    filters: { order_nsu: "eq." + orderNsu },
    limit: 1,
  });
  const order = rows[0];
  const eid = (r) => `${orderNsu}:${transactionNsu || "none"}:${r}`;
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
  let check;
  try {
    check = await paymentCheck(ctx.env, ctx.fetch, {
      orderNsu,
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
  // Valor: usa `amount` (ou `paid_amount` se a API não enviar `amount`). Só rejeita PAGAMENTO MENOR que o pedido
  // (a InfinitePay pode somar taxas/juros do cliente; pagar a mais não é fraude).
  const got = check.amount ?? check.paidAmount;
  if (got === null || got === undefined || got < order.total_cents) {
    await logEvent(
      ctx,
      ev("rejected_amount_mismatch", {
        amount_cents: got ?? null,
        status_received: "paid",
      }),
    );
    console.error(
      "payment_amount_mismatch",
      order.public_ref,
      got,
      order.total_cents,
    );
    return { ok: false, permanent: true, reason: "amount_mismatch", order };
  }
  await logEvent(
    ctx,
    ev("accepted", { amount_cents: check.amount, status_received: "paid" }),
  ); // duplicado = ignorado pelo UNIQUE
  const patch = {
    payment_status: "paid",
    status: "paid",
    paid_at: ctx.now().toISOString(),
    payment_method: check.captureMethod,
    paid_amount_cents: check.paidAmount ?? check.amount,
  };
  const filt = {
    id: "eq." + order.id,
    payment_status: "in.(pending,failed,expired,cancelled)",
  };
  let upd;
  try {
    upd = await ctx.db.update("orders", filt, {
      ...patch,
      transaction_nsu: transactionNsu || null,
      invoice_slug: slug || null,
    });
  } catch (e) {
    // ex.: índice único de transaction_nsu/invoice_slug: o dinheiro entrou, então confirma sem esses campos
    console.error("order_paid_update_failed", e.code);
    await logEvent(
      ctx,
      ev("error_update_retry", { amount_cents: check.amount }),
    );
    upd = await ctx.db.update("orders", filt, patch);
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

// Estorno: a InfinitePay não envia webhook de estorno na doc pública; o admin registra após estornar no app deles.
export async function flagRefund(ctx, admin, orderId, justification) {
  if (typeof justification !== "string" || justification.trim().length < 10)
    throw new HttpError(
      422,
      "validation",
      "Informe uma justificativa (mín. 10 caracteres).",
    );
  const { rows } = await ctx.db.select("orders", {
    filters: { id: "eq." + orderId },
    limit: 1,
  });
  if (!rows[0]) throw new HttpError(404, "not_found", "Pedido não encontrado.");
  if (rows[0].payment_status !== "paid")
    throw new HttpError(
      409,
      "conflict",
      "Só pedidos pagos podem ser marcados como estornados.",
    );
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
