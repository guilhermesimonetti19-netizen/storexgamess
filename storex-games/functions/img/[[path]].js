// Proxy das imagens do bucket público "product-images" com cache de borda da Cloudflare.
// O navegador pede /img/<produto>/<arquivo>; a Cloudflare guarda a resposta por 1 ano e o
// Supabase só é consultado quando a imagem ainda não está no cache (evita Cached Egress).
// Os nomes dos arquivos são aleatórios e nunca mudam, então o cache "immutable" é seguro.
export const onRequest = async ({ request, env }) => {
  if (request.method !== "GET" && request.method !== "HEAD")
    return new Response("Method not allowed", { status: 405 });

  const path = decodeURIComponent(
    new URL(request.url).pathname.replace(/^\/img\//, ""),
  );
  // Somente "<uuid do produto>/<nome-do-arquivo>" (sem .. nem subpastas extras).
  if (!/^[0-9a-f-]{36}\/[\w.-]+$/i.test(path) || path.includes(".."))
    return new Response("Not found", { status: 404 });
  if (!env.SUPABASE_URL) return new Response("Not configured", { status: 503 });

  const origin = `${env.SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/product-images/${path}`;
  const res = await fetch(origin, {
    cf: {
      cacheEverything: true,
      cacheTtlByStatus: { "200-299": 31536000, "400-599": 0 },
    },
  });
  if (!res.ok) return new Response("Not found", { status: 404 });

  const type = res.headers.get("content-type") || "";
  if (!/^image\/(png|jpeg|webp)$/.test(type))
    return new Response("Not found", { status: 404 });

  return new Response(request.method === "HEAD" ? null : res.body, {
    status: 200,
    headers: {
      "Content-Type": type,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
};
