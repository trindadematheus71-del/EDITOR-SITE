export async function onRequestGet({ params, env }) {
  const key = String(params.key || '');
  if (!/^[a-zA-Z0-9-]+\.(jpg|png|webp|gif|pdf)$/i.test(key)) return new Response('Não encontrado', { status: 404 });
  if (!env.BUCKET) return new Response('Binding BUCKET não configurado', { status: 500 });

  try {
    const object = await env.BUCKET.get(key);
    if (!object) return new Response('Não encontrado', { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    if (key.toLowerCase().endsWith('.pdf')) headers.set('Content-Disposition', 'inline');
    return new Response(object.body, { headers });
  } catch (error) {
    console.error('GET /api/images/:key:', error);
    return new Response('Erro ao buscar arquivo no R2', { status: 500 });
  }
}
