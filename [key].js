export async function onRequestGet({ params, env }) {
  const key = String(params.key || '');
  if (!/^[a-zA-Z0-9-]+\.(jpg|png|webp|gif)$/.test(key)) return new Response('Não encontrado', { status: 404 });
  const object = await env.BUCKET.get(key);
  if (!object) return new Response('Não encontrado', { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return new Response(object.body, { headers });
}
