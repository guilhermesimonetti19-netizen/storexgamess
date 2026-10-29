// Cliente mínimo para a API REST do Supabase (PostgREST) com service_role. Somente servidor.
// fetchImpl padrão é uma função "arrow": evita "Illegal invocation" na Cloudflare Workers.
// Chaves legacy (JWT, começam com eyJ) vão em apikey + Authorization; chaves novas (sb_secret_...) só em apikey.
export function createDb({ url, key, fetchImpl = (...a) => fetch(...a) }) {
  const base = url.replace(/\/$/, "") + "/rest/v1";
  const headers = (extra) => ({
    apikey: key,
    ...(String(key).startsWith("eyJ")
      ? { Authorization: "Bearer " + key }
      : {}),
    "Content-Type": "application/json",
    ...extra,
  });
  async function call(method, path, { body, prefer } = {}) {
    const res = await fetchImpl(base + path, {
      method,
      headers: headers(prefer ? { Prefer: prefer } : {}),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      /* corpo não-JSON */
    }
    if (!res.ok) {
      const e = new Error("db_error");
      e.status = res.status;
      e.code = data?.code;
      throw e;
    } // nunca repassa a mensagem ao cliente
    return { data, res };
  }
  const qs = (filters = {}, o = {}) => {
    const p = new URLSearchParams();
    if (o.select) p.set("select", o.select);
    for (const [k, v] of Object.entries(filters)) p.set(k, v);
    if (o.order) p.set("order", o.order);
    if (o.limit !== undefined) p.set("limit", String(o.limit));
    if (o.offset) p.set("offset", String(o.offset));
    const s = p.toString();
    return s ? "?" + s : "";
  };
  return {
    async select(table, o = {}) {
      const { data, res } = await call("GET", `/${table}${qs(o.filters, o)}`, {
        prefer: o.count ? "count=exact" : undefined,
      });
      let count = null;
      const cr = res.headers.get("content-range");
      if (cr && cr.includes("/")) {
        const n = Number(cr.split("/")[1]);
        if (!Number.isNaN(n)) count = n;
      }
      return { rows: data || [], count };
    },
    async insert(table, rows) {
      const { data } = await call("POST", `/${table}`, {
        body: rows,
        prefer: "return=representation",
      });
      return data || [];
    },
    async update(table, filters, patch) {
      const { data } = await call("PATCH", `/${table}${qs(filters)}`, {
        body: patch,
        prefer: "return=representation",
      });
      return data || [];
    },
    async remove(table, filters) {
      const { data } = await call("DELETE", `/${table}${qs(filters)}`, {
        prefer: "return=representation",
      });
      return data || [];
    },
    async upsert(table, rows, onConflict) {
      const { data } = await call(
        "POST",
        `/${table}?on_conflict=${onConflict}`,
        {
          body: rows,
          prefer: "resolution=merge-duplicates,return=representation",
        },
      );
      return data || [];
    },
    async rpc(name, args) {
      const { data } = await call("POST", `/rpc/${name}`, { body: args || {} });
      return data;
    },
  };
}
