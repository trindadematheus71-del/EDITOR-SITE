export async function onRequestPost({ request, env }) {
  try {
    const { dataUrl } = await request.json();
    if (typeof dataUrl !== 'string' || !/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(dataUrl)) return Response.json({ error: 'Imagem inválida.' }, { status: 400 });
    const match = dataUrl.match(/^data:(image\/[a-z0-9.+-]+);base64,([\s\S]+)$/i);
    const binary = atob(match[2]);
    if (binary.length > 12 * 1024 * 1024) return Response.json({ error: 'Imagem acima de 12 MB.' }, { status: 413 });
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    const ext = ({ 'image/jpeg':'jpg', 'image/jpg':'jpg', 'image/png':'png', 'image/webp':'webp', 'image/gif':'gif' })[match[1].toLowerCase()] || 'img';
    const key = crypto.randomUUID() + '.' + ext;
    await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: match[1] } });
    return Response.json({ key });
  } catch (error) { return Response.json({ error: 'Não foi possível enviar a imagem.' }, { status: 500 }); }
}
