export async function onRequestPost({ request, env }) {
  try {
    if (!env.BUCKET) return Response.json({ error: 'Binding BUCKET não configurado no Pages.' }, { status: 500 });
    const { dataUrl } = await request.json();
    if (typeof dataUrl !== 'string') return Response.json({ error: 'Arquivo inválido.' }, { status: 400 });

    const match = dataUrl.match(/^data:(image\/(?:png|jpeg|jpg|webp|gif)|application\/pdf);base64,([\s\S]+)$/i);
    if (!match) return Response.json({ error: 'Envie uma imagem ou um PDF válido.' }, { status: 400 });

    const mime = match[1].toLowerCase();
    const binary = atob(match[2]);
    if (binary.length > 12 * 1024 * 1024) return Response.json({ error: 'Arquivo acima de 12 MB.' }, { status: 413 });

    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    const ext = mime === 'application/pdf' ? 'pdf' : ({ 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' })[mime];
    const key = `${crypto.randomUUID()}.${ext}`;
    await env.BUCKET.put(key, bytes, { httpMetadata: { contentType: mime } });
    return Response.json({ key });
  } catch (error) {
    console.error('POST /api/upload:', error);
    return Response.json({ error: 'Não foi possível enviar o arquivo para o R2.' }, { status: 500 });
  }
}
