export async function onRequestGet({ params, env }) {
  const key = String(params.key || "");
  if (!/^[a-zA-Z0-9-]+\.(jpg|jpeg|png|webp|gif|avif|svg)$/i.test(key)) return new Response("Não encontrado", { status: 404 });
  const bucket = env.BUCKET || env.bucket;
  if (!bucket) return new Response("Binding R2 ausente: configure BUCKET no Pages.", { status: 500 });
  const object = await bucket.get(key);
  if (!object) return new Response("Não encontrado", { status: 404 });
  const headers = new Headers(); object.writeHttpMetadata(headers);
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  return new Response(object.body, { headers });
}
