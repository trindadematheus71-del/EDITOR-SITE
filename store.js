export async function onRequestGet({ env }) {
  try {
    const row = await env.DB.prepare('SELECT payload FROM store_data WHERE id = 1').first();
    if (!row) return Response.json(null);
    return new Response(row.payload, { headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  } catch (error) { return Response.json({ error: 'Erro ao ler o banco.' }, { status: 500 }); }
}

export async function onRequestPut({ request, env }) {
  try {
    const payload = await request.text();
    if (payload.length > 20_000_000) return Response.json({ error: 'Dados muito grandes.' }, { status: 413 });
    JSON.parse(payload);
    await env.DB.prepare(`INSERT INTO store_data (id, payload, updated_at) VALUES (1, ?, datetime('now')) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`).bind(payload).run();
    return Response.json({ ok: true });
  } catch (error) { return Response.json({ error: 'Erro ao salvar no banco.' }, { status: 500 }); }
}
