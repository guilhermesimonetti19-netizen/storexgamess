import {
  HttpError,
  json,
  bad,
  str,
  int,
  bool,
  uuid,
  isoDate,
  slugify,
  SLUG_RE,
  safeEqual,
  rateLimit,
  cleanTerm,
  csvCell,
  randomHex,
  UUID_RE,
} from "./lib/util.js";
import { createDb } from "./lib/db.js";
import { getUser, requireUser, requireAdmin } from "./lib/auth.js";
import {
  loadSettings,
  PUBLIC_SETTING_KEYS,
  ALL_SETTING_KEYS,
} from "./lib/settings.js";
import {
  createOrder,
  ensureCheckout,
  serializeOrder,
  getOwnOrder,
} from "./lib/orders.js";
import { verifyAndApply, flagRefund, audit, logEvent } from "./lib/payments.js";
import { isConfigured } from "./lib/infinitepay.js";

const PAGE_SIZE = 12;
const SORTS = {
  relevance: "is_featured.desc,created_at.desc",
  price_asc: "effective_price_cents.asc",
  price_desc: "effective_price_cents.desc",
  newest: "created_at.desc",
};
const imgUrl = (env, path) =>
  path
    ? `${env.SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/product-images/${path}`
    : null;
const pubProduct = (env, p) => ({
  ...p,
  image_url: imgUrl(env, p.image_path),
  image_path: undefined,
});
// Cabeçalhos do Storage: chave legacy (eyJ...) usa apikey + Bearer; chave nova (sb_secret_...) só apikey.
const svcAuth = (env) => ({
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  ...(String(env.SUPABASE_SERVICE_ROLE_KEY).startsWith("eyJ")
    ? { Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY }
    : {}),
});

async function readJson(req, max = 50_000) {
  const t = await req.text();
  if (t.length > max)
    throw new HttpError(413, "too_large", "Requisição grande demais.");
  try {
    return t ? JSON.parse(t) : {};
  } catch {
    throw bad("JSON inválido.");
  }
}
const ORDER_STATUS = [
  "pending",
  "paid",
  "in_delivery",
  "completed",
  "cancelled",
  "expired",
  "refunded",
];
const PAY_STATUS = [
  "pending",
  "paid",
  "failed",
  "cancelled",
  "expired",
  "refunded",
];
const DELIVERY = ["pending", "delivered", "needs_review"];

// ---------- Públicas ----------
async function listProducts(ctx, _p, url) {
  const q = url.searchParams,
    f = {};
  const term = cleanTerm(q.get("q"));
  if (term)
    f.or = `(name.ilike.*${term}*,short_description.ilike.*${term}*,platform.ilike.*${term}*)`;
  if (q.get("category")) {
    if (!SLUG_RE.test(q.get("category"))) throw bad("Categoria inválida.");
    f.category_slug = "eq." + q.get("category");
  }
  if (q.get("platform")) f.platform = "eq." + cleanTerm(q.get("platform"));
  if (q.get("ids")) {
    const ids = q.get("ids").split(",").slice(0, 20);
    ids.forEach((i) => uuid(i));
    f.id = `in.(${ids.join(",")})`;
  }
  const min = int(q.get("min"), "min", { min: 0, max: 1e8 }),
    max = int(q.get("max"), "max", { min: 0, max: 1e8 });
  if (min !== null && max !== null) {
    f["effective_price_cents"] = `gte.${min}`;
    f["and"] = `(effective_price_cents.lte.${max})`;
  } else if (min !== null) f.effective_price_cents = `gte.${min}`;
  else if (max !== null) f.effective_price_cents = `lte.${max}`;
  if (q.get("available") === "1") f.in_stock = "eq.true";
  if (q.get("featured") === "1") f.is_featured = "eq.true";
  if (q.get("new") === "1") f.is_new = "eq.true";
  const page = Math.max(
      1,
      int(q.get("page") || 1, "page", { min: 1, max: 1000 }),
    ),
    size = Math.min(
      48,
      int(q.get("pageSize") || PAGE_SIZE, "pageSize", { min: 1, max: 48 }),
    );
  const { rows, count } = await ctx.db.select("catalog_products", {
    filters: f,
    order: SORTS[q.get("sort")] || SORTS.relevance,
    limit: size,
    offset: (page - 1) * size,
    count: true,
    select:
      "id,slug,name,short_description,platform,category_slug,category_name,price_cents,promo_active_cents,effective_price_cents,track_stock,stock,max_per_order,in_stock,is_featured,is_new,image_path",
  });
  return json({
    items: rows.map((r) => pubProduct(ctx.env, r)),
    total: count ?? rows.length,
    page,
    pageSize: size,
  });
}
async function getProduct(ctx, { slug }) {
  if (!SLUG_RE.test(slug))
    throw new HttpError(404, "not_found", "Produto não encontrado.");
  const { rows } = await ctx.db.select("catalog_products", {
    filters: { slug: "eq." + slug },
    limit: 1,
  });
  if (!rows[0])
    throw new HttpError(404, "not_found", "Produto não encontrado.");
  const { rows: imgs } = await ctx.db.select("product_images", {
    filters: { product_id: "eq." + rows[0].id },
    order: "position.asc",
    select: "path,position",
  });
  return json({
    ...pubProduct(ctx.env, rows[0]),
    images: imgs.map((i) => imgUrl(ctx.env, i.path)),
  });
}

// fetchImpl padrão é uma função "arrow": ctx.fetch(...) chamado como método quebra na Cloudflare ("Illegal invocation") se for o fetch puro.
export function createApp({
  env,
  db,
  fetchImpl = (...a) => fetch(...a),
  now = () => new Date(),
}) {
  db =
    db ||
    createDb({
      url: env.SUPABASE_URL,
      key: env.SUPABASE_SERVICE_ROLE_KEY,
      fetchImpl,
    });
  const routes = [];
  const R = (method, path, access, fn) =>
    routes.push({
      method,
      re: new RegExp("^" + path.replace(/:(\w+)/g, "(?<$1>[^/]+)") + "/?$"),
      access,
      fn,
    });

  R("GET", "/api/config", "public", async (ctx) =>
    json(
      {
        supabaseUrl: env.SUPABASE_URL,
        supabaseAnonKey: env.SUPABASE_ANON_KEY,
        checkoutConfigured: isConfigured(env),
      },
      200,
      { "Cache-Control": "public, max-age=60" },
    ),
  );
  R("GET", "/api/settings", "public", async (ctx) =>
    json(
      await loadSettings(db, PUBLIC_SETTING_KEYS).then((s) => ({
        ...s,
        whatsapp_number: s.whatsapp_number || "",
      })),
    ),
  );
  R("GET", "/api/pages/:slug", "public", async (ctx, { slug }) => {
    const { rows } = await db.select("pages", {
      filters: { slug: "eq." + slug.replace(/[^a-z-]/g, "") },
      limit: 1,
    });
    if (!rows[0])
      throw new HttpError(404, "not_found", "Página não encontrada.");
    return json(rows[0]);
  });
  R("GET", "/api/categories", "public", async () => {
    const { rows } = await db.select("categories", {
      filters: { is_active: "eq.true" },
      order: "position.asc",
      select: "id,name,slug,description",
    });
    return json(rows);
  });
  R("GET", "/api/platforms", "public", async () => {
    const { rows } = await db.select("catalog_products", {
      select: "platform",
      limit: 1000,
    });
    return json(
      [...new Set(rows.map((r) => r.platform).filter(Boolean))].sort(),
    );
  });
  R("GET", "/api/products", "public", listProducts);
  R("GET", "/api/products/:slug", "public", getProduct);

  // ---------- Cliente ----------
  R("GET", "/api/me", "user", async (ctx) => {
    const u = await requireUser(ctx);
    const { rows } = await db.select("profiles", {
      filters: { id: "eq." + u.id },
      select: "display_name,phone,role",
      limit: 1,
    });
    return json({
      id: u.id,
      email: u.email,
      confirmed: u.confirmed,
      displayName: rows[0]?.display_name ?? null,
      phone: rows[0]?.phone ?? null,
      isAdmin: rows[0]?.role === "admin",
    });
  });
  R("PATCH", "/api/me", "user", async (ctx) => {
    // lista branca: role/outros campos são ignorados
    const u = await requireUser(ctx);
    const b = await readJson(ctx.request);
    const patch = {};
    if ("displayName" in b)
      patch.display_name = str(b.displayName, "Nome", { max: 80 });
    if ("phone" in b) {
      patch.phone = str(b.phone, "Telefone", { max: 20 });
      if (patch.phone && !/^[0-9+() -]{8,20}$/.test(patch.phone))
        throw bad("Telefone inválido.");
    }
    if (!Object.keys(patch).length) throw bad("Nada para atualizar.");
    await db.upsert("profiles", [{ id: u.id, ...patch }], "id");
    return json({ ok: true });
  });
  R("POST", "/api/orders", "user", async (ctx) => {
    const u = await requireUser(ctx);
    if (!rateLimit(`ord:${u.id}`, 10, 60_000))
      throw new HttpError(
        429,
        "rate_limited",
        "Muitas tentativas. Aguarde um minuto.",
      );
    const order = await createOrder(ctx, u, await readJson(ctx.request));
    let checkoutUrl = null,
      checkoutError = false;
    try {
      checkoutUrl = await ensureCheckout(ctx, order);
    } catch {
      checkoutError = true;
      console.error("checkout_link_failed");
    }
    return json(
      {
        ref: order.public_ref,
        totalCents: order.total_cents,
        checkoutUrl,
        testMode: !isConfigured(env),
        checkoutError,
      },
      201,
    );
  });
  R("GET", "/api/orders", "user", async (ctx) => {
    const u = await requireUser(ctx);
    const { rows } = await db.select("orders", {
      filters: { user_id: "eq." + u.id },
      order: "created_at.desc",
      limit: 50,
      select:
        "public_ref,status,payment_status,delivery_status,total_cents,created_at",
    });
    return json(
      rows.map((o) => ({
        ref: o.public_ref,
        status: o.status,
        paymentStatus: o.payment_status,
        deliveryStatus: o.delivery_status,
        totalCents: o.total_cents,
        createdAt: o.created_at,
      })),
    );
  });
  R("GET", "/api/orders/:ref", "user", async (ctx, { ref }) => {
    const u = await requireUser(ctx);
    const { order, items } = await getOwnOrder(ctx, u, ref);
    return json(await serializeOrder(ctx, order, items));
  });
  R("POST", "/api/orders/:ref/checkout", "user", async (ctx, { ref }) => {
    const u = await requireUser(ctx);
    const { order } = await getOwnOrder(ctx, u, ref);
    if (order.payment_status !== "pending")
      throw new HttpError(409, "conflict", "Este pedido não está pendente.");
    const url = await ensureCheckout(ctx, order).catch(() => {
      throw new HttpError(
        502,
        "checkout_unavailable",
        "Checkout indisponível. Tente novamente.",
      );
    });
    return json({ checkoutUrl: url, testMode: !isConfigured(env) });
  });
  // Retorno do checkout NÃO prova pagamento: o servidor consulta a InfinitePay; query string só serve de entrada da consulta.
  R("POST", "/api/orders/:ref/verify", "user", async (ctx, { ref }) => {
    const u = await requireUser(ctx);
    const { order } = await getOwnOrder(ctx, u, ref);
    if (!rateLimit(`ver:${u.id}`, 20, 60_000))
      throw new HttpError(429, "rate_limited", "Aguarde um instante.");
    if (!isConfigured(env))
      return json({ paid: order.payment_status === "paid", testMode: true });
    const b = await readJson(ctx.request, 2000);
    const r = await verifyAndApply(ctx, {
      orderNsu: order.order_nsu,
      transactionNsu: str(b.transaction_nsu, "transaction_nsu", { max: 80 }),
      slug: str(b.slug, "slug", { max: 80 }),
      source: "verify",
    });
    if (!r.ok && !r.permanent)
      throw new HttpError(
        502,
        "provider_error",
        "Não foi possível confirmar agora. Tente novamente em instantes.",
      );
    return json({ paid: Boolean(r.paid) });
  });
  R("POST", "/api/orders/:ref/whatsapp-click", "user", async (ctx, { ref }) => {
    const u = await requireUser(ctx);
    const { order } = await getOwnOrder(ctx, u, ref);
    if (order.payment_status === "paid")
      await db.update(
        "orders",
        { id: "eq." + order.id },
        { whatsapp_link_opened_at: now().toISOString() },
      );
    return json({ ok: true });
  });
  R("POST", "/api/orders/:ref/cancel", "user", async (ctx, { ref }) => {
    const u = await requireUser(ctx);
    const { order } = await getOwnOrder(ctx, u, ref);
    const upd = await db.update(
      "orders",
      { id: "eq." + order.id, payment_status: "eq.pending" },
      { payment_status: "cancelled", status: "cancelled" },
    );
    if (!upd.length)
      throw new HttpError(
        409,
        "conflict",
        "Só pedidos pendentes podem ser cancelados.",
      );
    return json({ ok: true });
  });
  R("POST", "/api/webhooks/infinitepay", "webhook", async (ctx) => {
    const ip =
      ctx.request.headers.get("cf-connecting-ip") ||
      ctx.request.headers.get("x-forwarded-for") ||
      "x";
    if (!rateLimit(`wh:${ip}`, 120, 60_000))
      throw new HttpError(429, "rate_limited", "Limite excedido.");
    if (
      env.WEBHOOK_SECRET &&
      !safeEqual(ctx.url.searchParams.get("t"), env.WEBHOOK_SECRET)
    )
      throw new HttpError(401, "unauthorized", "Não autorizado.");
    const b = await readJson(ctx.request, 20_000);
    if (typeof b.order_nsu !== "string" || b.order_nsu.length > 40)
      return json({ ok: false, ignored: true }, 200);
    const r = await verifyAndApply(ctx, {
      orderNsu: b.order_nsu,
      transactionNsu: str(b.transaction_nsu, "x", { max: 80 }),
      slug: str(b.invoice_slug ?? b.slug, "x", { max: 80 }),
      source: "webhook",
    });
    if (
      b.receipt_url &&
      r.paid &&
      typeof b.receipt_url === "string" &&
      /^https:\/\//.test(b.receipt_url) &&
      r.order
    )
      await db
        .update(
          "orders",
          { id: "eq." + r.order.id },
          { receipt_url: b.receipt_url.slice(0, 500) },
        )
        .catch(() => {});
    if (!r.ok && !r.permanent) return json({ ok: false }, 400); // erro transitório: provedor tentará de novo
    return json({ ok: r.ok, duplicate: Boolean(r.duplicate) }, 200);
  });

  // ---------- Admin ----------
  const adm = (method, path, fn) =>
    R(method, "/api/admin" + path, "admin", async (ctx, p, url) => {
      const a = await requireAdmin(ctx);
      return fn(ctx, p, url, a);
    });
  adm("GET", "/dashboard", async (ctx, _p, url) => {
    const to = url.searchParams.get("to")
      ? isoDate(url.searchParams.get("to"), "to")
      : now().toISOString();
    const from = url.searchParams.get("from")
      ? isoDate(url.searchParams.get("from"), "from")
      : new Date(Date.parse(to) - 30 * 864e5).toISOString();
    if (
      Date.parse(from) >= Date.parse(to) ||
      Date.parse(to) - Date.parse(from) > 400 * 864e5
    )
      throw bad("Período inválido (máx. 400 dias).");
    const bucket = ["day", "week", "month"].includes(
      url.searchParams.get("bucket"),
    )
      ? url.searchParams.get("bucket")
      : "day";
    const s = await loadSettings(db, [
      "alert_pending_hours",
      "alert_low_stock",
    ]);
    const data = await db.rpc("admin_dashboard", {
      p_from: from,
      p_to: to,
      p_tz: "America/Sao_Paulo",
      p_bucket: bucket,
      p_pending_hours: Number(s.alert_pending_hours) || 24,
      p_low_stock: Number(s.alert_low_stock) || 3,
    });
    const { rows: recent } = await db.select("orders", {
      order: "created_at.desc",
      limit: 10,
      select:
        "id,public_ref,created_at,total_cents,status,payment_status,delivery_status",
    });
    return json({
      ...data,
      net_available: false,
      net_note:
        "Valor líquido depende do extrato da InfinitePay (taxas não são conhecidas pelo sistema).",
      recent_orders: recent,
      generated_at: now().toISOString(),
    });
  });

  const PF = (b, partial) => {
    const o = {},
      has = (k) => !partial || k in b;
    if (has("name"))
      o.name = str(b.name, "Nome", { min: 2, max: 140, required: true });
    if (has("slug") || (!partial && !b.slug)) {
      o.slug = b.slug ? slugify(b.slug) : slugify(b.name);
      if (!SLUG_RE.test(o.slug || "")) throw bad("Slug inválido.");
    }
    for (const [k, lab, max] of [
      ["short_description", "Descrição curta", 300],
      ["long_description", "Descrição completa", 8000],
      ["platform", "Plataforma", 60],
      ["requirements", "Requisitos", 1000],
      ["region", "Região", 100],
      ["edition", "Edição", 100],
      ["specific_terms", "Termos", 2000],
    ])
      if (has(k)) o[k] = str(b[k], lab, { max });
    if (has("category_id"))
      o.category_id = b.category_id ? uuid(b.category_id, "categoria") : null;
    if (has("price_cents"))
      o.price_cents = int(b.price_cents, "Preço", {
        min: 1,
        max: 1e8,
        required: true,
      });
    if (has("promo_price_cents"))
      o.promo_price_cents = int(b.promo_price_cents, "Preço promocional", {
        min: 1,
        max: 1e8,
      });
    for (const k of ["promo_starts_at", "promo_ends_at"])
      if (has(k)) o[k] = b[k] ? isoDate(b[k], k) : null;
    if (has("track_stock")) o.track_stock = bool(b.track_stock);
    if (has("stock")) o.stock = int(b.stock, "Estoque", { min: 0, max: 1e6 });
    if (has("max_per_order"))
      o.max_per_order = int(b.max_per_order ?? 1, "Máx. por pedido", {
        min: 1,
        max: 10,
      });
    for (const k of ["is_active", "is_featured", "is_new"])
      if (has(k)) o[k] = bool(b[k]);
    if (
      o.promo_price_cents &&
      o.price_cents &&
      o.promo_price_cents >= o.price_cents
    )
      throw bad("Preço promocional deve ser menor que o preço.");
    if (o.track_stock && (o.stock === null || o.stock === undefined))
      throw bad("Informe o estoque.");
    if (o.track_stock === false) o.stock = null;
    return o;
  };
  const DF = (b) => ({
    instructions: str(b.instructions, "Instruções", { max: 4000 }),
    steps: str(b.steps, "Passos", { max: 2000 }),
    required_info: str(b.required_info, "Dados necessários", { max: 1000 }),
    eta_text: str(b.eta_text, "Prazo", { max: 200 }),
    notes: str(b.notes, "Observações", { max: 1000 }),
    whatsapp_message: str(b.whatsapp_message, "Mensagem", { max: 500 }),
  });
  const dbErr = (e) => {
    if (e.code === "23505")
      throw new HttpError(
        409,
        "conflict",
        "Já existe um registro com esse slug.",
      );
    if (e.code === "23514" || e.code === "23503") throw bad("Dados inválidos.");
    throw e;
  };

  adm("GET", "/products", async (ctx, _p, url) => {
    const q = url.searchParams,
      f = { archived_at: "is.null" };
    const term = cleanTerm(q.get("q"));
    if (term) f.name = `ilike.*${term}*`;
    if (q.get("active") === "1") f.is_active = "eq.true";
    if (q.get("active") === "0") f.is_active = "eq.false";
    const page = Math.max(1, Number(q.get("page")) || 1);
    const { rows, count } = await db.select("products", {
      filters: f,
      order: "created_at.desc",
      limit: 20,
      offset: (page - 1) * 20,
      count: true,
      select:
        "id,slug,name,platform,price_cents,promo_price_cents,is_active,is_featured,track_stock,stock,category_id",
    });
    return json({ items: rows, total: count ?? rows.length, page });
  });
  adm("GET", "/products/:id", async (ctx, { id }) => {
    uuid(id);
    const { rows } = await db.select("products", {
      filters: { id: "eq." + id },
      limit: 1,
    });
    if (!rows[0])
      throw new HttpError(404, "not_found", "Produto não encontrado.");
    const [{ rows: d }, { rows: imgs }] = await Promise.all([
      db.select("product_delivery", {
        filters: { product_id: "eq." + id },
        limit: 1,
      }),
      db.select("product_images", {
        filters: { product_id: "eq." + id },
        order: "position.asc",
      }),
    ]);
    return json({
      ...rows[0],
      delivery: d[0] || {},
      images: imgs.map((i) => ({ id: i.id, url: imgUrl(env, i.path) })),
    });
  });
  adm("POST", "/products", async (ctx, _p, _u, a) => {
    const b = await readJson(ctx.request);
    const o = PF(b, false);
    let p;
    try {
      [p] = await db.insert("products", [o]);
    } catch (e) {
      dbErr(e);
    }
    await db.insert("product_delivery", [
      { product_id: p.id, ...DF(b.delivery || {}) },
    ]);
    await audit(ctx, a, "product.create", "product", p.id, {
      name: p.name,
      price_cents: p.price_cents,
    });
    return json(p, 201);
  });
  adm("PATCH", "/products/:id", async (ctx, { id }, _u, a) => {
    uuid(id);
    const b = await readJson(ctx.request);
    const o = PF(b, true);
    const { rows: before } = await db.select("products", {
      filters: { id: "eq." + id },
      limit: 1,
    });
    if (!before[0])
      throw new HttpError(404, "not_found", "Produto não encontrado.");
    let p = before[0];
    if (Object.keys(o).length) {
      try {
        [p] = await db.update("products", { id: "eq." + id }, o);
      } catch (e) {
        dbErr(e);
      }
    }
    if (b.delivery) {
      await db.upsert(
        "product_delivery",
        [
          {
            product_id: id,
            ...DF(b.delivery),
            updated_at: now().toISOString(),
          },
        ],
        "product_id",
      );
      await audit(ctx, a, "product.delivery_update", "product", id, null);
    }
    if ("price_cents" in o && o.price_cents !== before[0].price_cents)
      await audit(ctx, a, "product.price_change", "product", id, {
        from: before[0].price_cents,
        to: o.price_cents,
      });
    await audit(ctx, a, "product.update", "product", id, {
      fields: Object.keys(o),
    });
    return json(p);
  });
  adm("DELETE", "/products/:id", async (ctx, { id }, _u, a) => {
    // arquiva (preserva histórico); apaga de fato só se nunca vendido
    uuid(id);
    const { rows: used } = await db.select("order_items", {
      filters: { product_id: "eq." + id },
      limit: 1,
      select: "id",
    });
    if (used.length) {
      await db.update(
        "products",
        { id: "eq." + id },
        { is_active: false, archived_at: now().toISOString() },
      );
      await audit(ctx, a, "product.archive", "product", id, null);
      return json({ archived: true });
    }
    await db.remove("products", { id: "eq." + id });
    await audit(ctx, a, "product.delete", "product", id, null);
    return json({ deleted: true });
  });
  const MIME = {
    "image/png": ["png", [0x89, 0x50, 0x4e, 0x47]],
    "image/jpeg": ["jpg", [0xff, 0xd8, 0xff]],
    "image/webp": ["webp", [0x52, 0x49, 0x46, 0x46]],
  };
  adm("POST", "/products/:id/images", async (ctx, { id }, _u, a) => {
    uuid(id);
    const ct = (ctx.request.headers.get("content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    const m = MIME[ct];
    if (!m) throw bad("Formato inválido (use PNG, JPG ou WebP).");
    const buf = new Uint8Array(await ctx.request.arrayBuffer());
    if (!buf.length || buf.length > 2 * 1024 * 1024)
      throw bad("Imagem deve ter até 2 MB.");
    if (
      !m[1].every((x, i) => buf[i] === x) ||
      (ct === "image/webp" &&
        String.fromCharCode(...buf.slice(8, 12)) !== "WEBP")
    )
      throw bad("Conteúdo não corresponde a uma imagem válida.");
    const { rows: pr } = await db.select("products", {
      filters: { id: "eq." + id },
      select: "id",
      limit: 1,
    });
    if (!pr[0])
      throw new HttpError(404, "not_found", "Produto não encontrado.");
    const { rows: ex } = await db.select("product_images", {
      filters: { product_id: "eq." + id },
      select: "id",
    });
    if (ex.length >= 8) throw bad("Máximo de 8 imagens por produto.");
    const path = `${id}/${randomHex(12)}.${m[0]}`; // nome aleatório; o nome enviado é ignorado
    const up = await ctx.fetch(
      `${env.SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/product-images/${path}`,
      {
        method: "POST",
        headers: { ...svcAuth(env), "Content-Type": ct, "x-upsert": "false" },
        body: buf,
      },
    );
    if (!up.ok)
      throw new HttpError(502, "storage_error", "Falha ao enviar a imagem.");
    const [row] = await db.insert("product_images", [
      {
        product_id: id,
        path,
        position: ex.length,
        mime_type: ct,
        size_bytes: buf.length,
      },
    ]);
    await audit(ctx, a, "product.image_add", "product", id, { image: row.id });
    return json({ id: row.id, url: imgUrl(env, path) }, 201);
  });
  adm(
    "DELETE",
    "/products/:id/images/:imageId",
    async (ctx, { id, imageId }, _u, a) => {
      uuid(id);
      uuid(imageId);
      const { rows } = await db.select("product_images", {
        filters: { id: "eq." + imageId, product_id: "eq." + id },
        limit: 1,
      });
      if (!rows[0])
        throw new HttpError(404, "not_found", "Imagem não encontrada.");
      await ctx
        .fetch(
          `${env.SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/product-images/${rows[0].path}`,
          { method: "DELETE", headers: svcAuth(env) },
        )
        .catch(() => {});
      await db.remove("product_images", { id: "eq." + imageId });
      await audit(ctx, a, "product.image_remove", "product", id, {
        image: imageId,
      });
      return json({ ok: true });
    },
  );
  adm("GET", "/categories", async () =>
    json((await db.select("categories", { order: "position.asc" })).rows),
  );
  adm("PATCH", "/categories/:id", async (ctx, { id }, _u, a) => {
    uuid(id);
    const b = await readJson(ctx.request);
    const o = {};
    if ("name" in b)
      o.name = str(b.name, "Nome", { min: 2, max: 80, required: true });
    if ("description" in b)
      o.description = str(b.description, "Descrição", { max: 500 });
    if ("is_active" in b) o.is_active = bool(b.is_active);
    if ("position" in b)
      o.position = int(b.position, "Posição", { min: 0, max: 999 });
    const r = await db.update("categories", { id: "eq." + id }, o);
    await audit(ctx, a, "category.update", "category", id, {
      fields: Object.keys(o),
    });
    return json(r[0] || {});
  });

  adm("GET", "/orders", async (ctx, _p, url) => {
    const q = url.searchParams,
      f = {};
    if (q.get("payment_status") && PAY_STATUS.includes(q.get("payment_status")))
      f.payment_status = "eq." + q.get("payment_status");
    if (q.get("status") && ORDER_STATUS.includes(q.get("status")))
      f.status = "eq." + q.get("status");
    if (q.get("delivery_status") && DELIVERY.includes(q.get("delivery_status")))
      f.delivery_status = "eq." + q.get("delivery_status");
    if (q.get("ref"))
      f.public_ref = "ilike.*" + cleanTerm(q.get("ref")).toUpperCase() + "*";
    if (q.get("from")) f.created_at = "gte." + isoDate(q.get("from"), "from");
    if (q.get("to")) f.and = `(created_at.lt.${isoDate(q.get("to"), "to")})`;
    if (q.get("whatsapp") === "1") {
      f.payment_status = "eq.paid";
      f.delivery_status = "eq.pending";
      f.whatsapp_link_opened_at = "not.is.null";
    }
    if (q.get("stale") === "1") {
      const s = await loadSettings(db, ["alert_pending_hours"]);
      f.payment_status = "eq.pending";
      f.created_at =
        "lt." +
        new Date(
          now().getTime() - (Number(s.alert_pending_hours) || 24) * 36e5,
        ).toISOString();
    }
    const page = Math.max(1, Number(q.get("page")) || 1);
    const { rows, count } = await db.select("orders", {
      filters: f,
      order: "created_at.desc",
      limit: 20,
      offset: (page - 1) * 20,
      count: true,
      select:
        "id,public_ref,created_at,total_cents,status,payment_status,delivery_status,paid_at",
    });
    return json({ items: rows, total: count ?? rows.length, page });
  });
  adm("GET", "/orders/export.csv", async (ctx, _p, url) => {
    const from = isoDate(
        url.searchParams.get("from") ||
          new Date(now().getTime() - 30 * 864e5).toISOString(),
        "from",
      ),
      to = isoDate(url.searchParams.get("to") || now().toISOString(), "to");
    const { rows } = await db.select("orders", {
      filters: { created_at: "gte." + from, and: `(created_at.lt.${to})` },
      order: "created_at.desc",
      limit: 5000,
      select:
        "public_ref,created_at,status,payment_status,delivery_status,total_cents,paid_at",
    });
    const head =
      "pedido,criado_em,status,pagamento,entrega,total_reais,pago_em";
    const lines = rows.map((o) =>
      [
        o.public_ref,
        o.created_at,
        o.status,
        o.payment_status,
        o.delivery_status,
        (o.total_cents / 100).toFixed(2),
        o.paid_at || "",
      ]
        .map(csvCell)
        .join(","),
    );
    return new Response([head, ...lines].join("\n"), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="pedidos.csv"',
        "Cache-Control": "no-store",
      },
    });
  });
  adm("GET", "/orders/:id", async (ctx, { id }) => {
    uuid(id);
    const { rows } = await db.select("orders", {
      filters: { id: "eq." + id },
      limit: 1,
    });
    if (!rows[0])
      throw new HttpError(404, "not_found", "Pedido não encontrado.");
    const [{ rows: items }, { rows: notes }, { rows: events }] =
      await Promise.all([
        db.select("order_items", { filters: { order_id: "eq." + id } }),
        db.select("order_notes", {
          filters: { order_id: "eq." + id },
          order: "created_at.desc",
        }),
        db.select("payment_events", {
          filters: { order_id: "eq." + id },
          order: "created_at.desc",
          select:
            "source,validation_result,status_received,amount_cents,created_at",
        }),
      ]);
    const { checkout_url, ...o } = rows[0];
    return json({ ...o, items, notes, events });
  });
  adm("PATCH", "/orders/:id", async (ctx, { id }, _u, a) => {
    // operacional apenas; NUNCA marca como pago
    uuid(id);
    const b = await readJson(ctx.request);
    const o = {};
    if (b.status !== undefined) {
      if (!["in_delivery", "completed", "cancelled"].includes(b.status))
        throw bad("Status não permitido.");
      o.status = b.status;
    }
    if (b.delivery_status !== undefined) {
      if (!DELIVERY.includes(b.delivery_status)) throw bad("Entrega inválida.");
      o.delivery_status = b.delivery_status;
      if (b.delivery_status === "delivered")
        o.delivered_at = now().toISOString();
    }
    if (!Object.keys(o).length) throw bad("Nada para atualizar.");
    const { rows } = await db.select("orders", {
      filters: { id: "eq." + id },
      limit: 1,
    });
    if (!rows[0])
      throw new HttpError(404, "not_found", "Pedido não encontrado.");
    if (
      ["in_delivery", "completed"].includes(o.status) &&
      rows[0].payment_status !== "paid"
    )
      throw new HttpError(409, "conflict", "Pedido sem pagamento confirmado.");
    if (o.status === "cancelled" && rows[0].payment_status !== "pending")
      throw new HttpError(
        409,
        "conflict",
        "Só pedidos pendentes podem ser cancelados.",
      );
    if (o.status === "cancelled") o.payment_status = "cancelled";
    const [u] = await db.update("orders", { id: "eq." + id }, o);
    await audit(ctx, a, "order.update", "order", id, o);
    return json(u);
  });
  adm("POST", "/orders/:id/notes", async (ctx, { id }, _u, a) => {
    uuid(id);
    const b = await readJson(ctx.request, 5000);
    const note = str(b.note, "Nota", { min: 1, max: 2000, required: true });
    const [n] = await db.insert("order_notes", [
      { order_id: id, author_id: a.id, note },
    ]);
    return json(n, 201);
  });
  adm("POST", "/orders/:id/reconcile", async (ctx, { id }, _u, a) => {
    uuid(id);
    const { rows } = await db.select("orders", {
      filters: { id: "eq." + id },
      limit: 1,
    });
    if (!rows[0])
      throw new HttpError(404, "not_found", "Pedido não encontrado.");
    if (!isConfigured(env))
      throw new HttpError(
        409,
        "not_configured",
        "InfinitePay não configurada.",
      );
    const r = await verifyAndApply(ctx, {
      orderNsu: rows[0].order_nsu,
      transactionNsu: rows[0].transaction_nsu,
      slug: rows[0].invoice_slug,
      source: "reconcile",
    });
    await audit(ctx, a, "order.reconcile", "order", id, {
      paid: Boolean(r.paid),
      reason: r.reason || null,
    });
    return json({ paid: Boolean(r.paid), reason: r.reason || null });
  });
  adm("POST", "/orders/:id/flag-refund", async (ctx, { id }, _u, a) => {
    uuid(id);
    const b = await readJson(ctx.request, 3000);
    await flagRefund(ctx, a, id, b.justification);
    return json({ ok: true });
  });
  adm("POST", "/reconcile", async (ctx, _p, _u, a) => {
    // expira pedidos pendentes antigos (após conferir com a InfinitePay)
    const hours = Number(env.PENDING_EXPIRE_HOURS) || 48;
    const cutoff = new Date(now().getTime() - hours * 36e5).toISOString();
    const { rows } = await db.select("orders", {
      filters: { payment_status: "eq.pending", created_at: "lt." + cutoff },
      limit: 100,
    });
    let expired = 0,
      paid = 0;
    for (const o of rows) {
      const r = isConfigured(env)
        ? await verifyAndApply(ctx, {
            orderNsu: o.order_nsu,
            transactionNsu: o.transaction_nsu,
            slug: o.invoice_slug,
            source: "reconcile",
          })
        : { ok: false };
      if (r.paid) {
        paid++;
        continue;
      }
      if (r.ok || !isConfigured(env)) {
        const u = await db.update(
          "orders",
          { id: "eq." + o.id, payment_status: "eq.pending" },
          { payment_status: "expired", status: "expired" },
        );
        expired += u.length;
      }
    }
    await audit(ctx, a, "orders.reconcile_batch", "order", null, {
      checked: rows.length,
      expired,
      paid,
    });
    return json({ checked: rows.length, expired, paid });
  });
  adm("GET", "/settings", async () => {
    const s = await loadSettings(db, ALL_SETTING_KEYS);
    const { rows } = await db.select("pages", { order: "slug.asc" });
    return json({ settings: s, pages: rows });
  });
  adm("PUT", "/settings", async (ctx, _p, _u, a) => {
    const b = await readJson(ctx.request);
    const rows = [];
    for (const k of ALL_SETTING_KEYS)
      if (k in b) {
        let v = String(b[k] ?? "").trim();
        if (v.length > 1000) throw bad(`${k} longo demais.`);
        if (k === "whatsapp_number" && v && !/^\d{10,15}$/.test(v))
          throw bad("WhatsApp: use só dígitos com DDI (ex.: 5511999999999).");
        if (k === "instagram_url" && v && !/^https:\/\//.test(v))
          throw bad("URL do Instagram deve começar com https://");
        if (k.startsWith("alert_") && !/^\d{1,4}$/.test(v))
          throw bad(`${k} deve ser número.`);
        rows.push({ key: k, value: v, updated_at: now().toISOString() });
      }
    if (rows.length) await db.upsert("store_settings", rows, "key");
    await audit(ctx, a, "settings.update", "settings", null, {
      keys: rows.map((r) => r.key),
    });
    return json({ ok: true });
  });
  adm("PUT", "/pages/:slug", async (ctx, { slug }, _u, a) => {
    if (!/^[a-z-]{2,40}$/.test(slug)) throw bad("Página inválida.");
    const b = await readJson(ctx.request, 30_000);
    await db.upsert(
      "pages",
      [
        {
          slug,
          title: str(b.title, "Título", { min: 2, max: 120, required: true }),
          body: str(b.body, "Texto", { max: 20000 }) || "",
          updated_at: now().toISOString(),
        },
      ],
      "slug",
    );
    await audit(ctx, a, "page.update", "page", slug, null);
    return json({ ok: true });
  });
  adm("GET", "/audit", async (ctx, _p, url) => {
    const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
    const { rows, count } = await db.select("audit_log", {
      order: "created_at.desc",
      limit: 30,
      offset: (page - 1) * 30,
      count: true,
    });
    return json({ items: rows, total: count ?? rows.length, page });
  });

  return async function handle(request) {
    const url = new URL(request.url);
    try {
      if (
        !env.SUPABASE_URL ||
        !env.SUPABASE_SERVICE_ROLE_KEY ||
        !env.SUPABASE_ANON_KEY
      )
        throw new HttpError(503, "not_configured", "Servidor não configurado.");
      if (request.method === "OPTIONS")
        return new Response(null, { status: 204 });
      for (const r of routes) {
        if (r.method !== request.method) continue;
        const m = r.re.exec(url.pathname);
        if (!m) continue;
        const ctx = { request, env, db, fetch: fetchImpl, now, url };
        return await r.fn(ctx, m.groups || {}, url);
      }
      throw new HttpError(404, "not_found", "Rota não encontrada.");
    } catch (e) {
      if (e instanceof HttpError)
        return json(
          { error: e.code, message: e.message, ...(e.extra || {}) },
          e.status,
        );
      console.error("internal_error", e?.code || e?.message?.slice(0, 80)); // sem stack/segredos
      return json(
        {
          error: "internal",
          message: "Erro interno. Tente novamente em instantes.",
        },
        500,
      );
    }
  };
}
export { getUser, logEvent, UUID_RE };
