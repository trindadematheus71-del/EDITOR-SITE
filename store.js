const CATALOG_KEY = "catalogs/editor-current.json";
const getBucket = env => env.BUCKET || env.bucket;

export async function onRequestGet({ env }) {
  try {
    const row = await env.DB.prepare("SELECT payload FROM store_data WHERE id = 1").first();
    if (!row) return Response.json(null, { headers: { "Cache-Control": "no-store" } });
    let pointer;
    try { pointer = JSON.parse(row.payload); } catch { pointer = null; }
    if (pointer?.storage === "r2" && pointer.key) {
      const bucket = getBucket(env);
      if (!bucket) return Response.json({ error: "Binding R2 ausente: configure BUCKET no Pages." }, { status: 500 });
      const object = await bucket.get(pointer.key);
      if (!object) return Response.json({ error: "Catálogo não encontrado no R2: " + pointer.key }, { status: 404 });
      return new Response(object.body, { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
    }
    return new Response(row.payload, { headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/store:", error);
    return Response.json({ error: error?.message || "Erro ao ler o catálogo no D1/R2." }, { status: 500 });
  }
}

export async function onRequestPut({ request, env }) {
  try {
    const bucket = getBucket(env);
    if (!bucket) return Response.json({ error: "Binding R2 ausente: configure BUCKET no Pages." }, { status: 500 });
    const payload = await request.text();
    if (payload.length > 40_000_000) return Response.json({ error: "Catálogo muito grande (limite de 40 MB)." }, { status: 413 });
    JSON.parse(payload);
    await bucket.put(CATALOG_KEY, payload, { httpMetadata: { contentType: "application/json; charset=utf-8", cacheControl: "no-cache" } });
    const pointer = JSON.stringify({ storage: "r2", key: CATALOG_KEY, updated_at: new Date().toISOString() });
    await env.DB.prepare(`INSERT INTO store_data (id, payload, updated_at) VALUES (1, ?, datetime('now')) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = datetime('now')`).bind(pointer).run();
    return Response.json({ ok: true, storage: "R2", pointer: "D1" });
  } catch (error) {
    console.error("PUT /api/store:", error);
    return Response.json({ error: error?.message || "Erro ao salvar o catálogo no D1/R2." }, { status: 500 });
  }
}
