const CATALOG_PREFIX = 'catalogs/store-data-';

export async function onRequestGet({ env }) {
  try {
    if (!env.DB || !env.BUCKET) {
      return Response.json({ error: 'Bindings ausentes: configure DB (D1) e BUCKET (R2) neste projeto Pages.' }, { status: 500 });
    }

    const row = await env.DB.prepare('SELECT payload FROM store_data WHERE id = 1').first();
    if (!row) return new Response('null', { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

    // Compatibilidade: registros antigos guardavam o JSON inteiro no D1.
    let saved;
    try { saved = JSON.parse(row.payload); } catch { saved = null; }

    if (saved && saved.__luxx_storage === 'r2' && typeof saved.key === 'string') {
      const object = await env.BUCKET.get(saved.key);
      if (!object) return Response.json({ error: 'O catálogo foi referenciado no D1, mas não foi encontrado no R2.', key: saved.key }, { status: 500 });
      return new Response(object.body, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
    }

    return new Response(row.payload, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('GET /api/store:', error);
    return Response.json({ error: 'Erro ao carregar o catálogo. Confira os bindings DB e BUCKET e a tabela store_data.' }, { status: 500 });
  }
}

export async function onRequestPut({ request, env }) {
  let key = null;
  try {
    if (!env.DB || !env.BUCKET) {
      return Response.json({ error: 'Bindings ausentes: configure DB (D1) e BUCKET (R2) neste projeto Pages.' }, { status: 500 });
    }

    const payload = await request.text();
    if (!payload || payload.length > 30_000_000) return Response.json({ error: 'Catálogo vazio ou acima do limite de 30 MB.' }, { status: 413 });
    const parsed = JSON.parse(payload);
    if (!parsed || typeof parsed !== 'object' || !parsed.settings || !Array.isArray(parsed.products) || !Array.isArray(parsed.categories)) {
      return Response.json({ error: 'Formato de catálogo inválido.' }, { status: 400 });
    }

    // O catálogo completo fica no R2; o D1 recebe apenas um ponteiro pequeno.
    key = `${CATALOG_PREFIX}${crypto.randomUUID()}.json`;
    await env.BUCKET.put(key, payload, { httpMetadata: { contentType: 'application/json; charset=utf-8' } });

    const pointer = JSON.stringify({ __luxx_storage: 'r2', key, updatedAt: new Date().toISOString() });
    await env.DB.prepare(`INSERT INTO store_data (id, payload, updated_at) VALUES (1, ?, datetime('now')) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`).bind(pointer).run();

    return Response.json({ ok: true, storage: 'R2', updatedAt: new Date().toISOString() });
  } catch (error) {
    console.error('PUT /api/store:', error);
    if (key && env.BUCKET) {
      // Se a atualização do D1 falhar, o objeto fica sem referência; não afeta o catálogo anterior.
    }
    return Response.json({ error: 'Não foi possível salvar o catálogo no R2/D1. Confira a tabela store_data e os bindings DB e BUCKET.' }, { status: 500 });
  }
}
