import { createDb } from "../server/lib/db.js";
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
export const onRequestGet = async ({ env }) => {
  const base = env.APP_BASE_URL.replace(/\/$/, "");
  const db = createDb({ url: env.SUPABASE_URL, key: env.SUPABASE_SERVICE_ROLE_KEY });
  const urls = ["/", "/produtos", ...["privacidade", "termos", "entrega", "reembolso", "contato"].map((s) => "/politicas/" + s)];
  try {
    const [c, p] = await Promise.all([
      db.select("categories", { filters: { is_active: "eq.true" }, select: "slug" }),
      db.select("catalog_products", { select: "slug", limit: 5000 }),
    ]);
    urls.push(...c.rows.map((x) => "/categoria/" + x.slug), ...p.rows.map((x) => "/produto/" + x.slug));
  } catch {}
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map((u) => `<url><loc>${esc(base + u)}</loc></url>`).join("")}</urlset>`;
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
};