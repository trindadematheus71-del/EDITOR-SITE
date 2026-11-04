export async function onRequestPost({ request, env }) {
  try {
    const bucket = env.BUCKET || env.bucket;
    if (!bucket) return Response.json({ error: "Binding R2 ausente: configure BUCKET no Pages (ou bucket)." }, { status: 500 });
    const body = await request.json();
    const dataUrl = body?.dataUrl;
    if (typeof dataUrl !== "string") return Response.json({ error: "Imagem inválida: dataUrl ausente." }, { status: 400 });
    const match = /^data:(image\/[a-z0-9.+-]+)(?:;charset=[^;,]+)?(;base64)?,([\s\S]+)$/i.exec(dataUrl);
    if (!match) return Response.json({ error: "Formato de imagem não suportado. Envie PNG, JPG, WEBP, GIF, AVIF ou SVG." }, { status: 400 });
    const mime = match[1].toLowerCase();
    let bytes;
    if (match[2]) {
      const binary = atob(match[3]);
      bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    } else {
      bytes = new TextEncoder().encode(decodeURIComponent(match[3]));
    }
    if (!bytes.length) return Response.json({ error: "O arquivo de imagem está vazio." }, { status: 400 });
    if (bytes.byteLength > 12 * 1024 * 1024) return Response.json({ error: "Imagem acima de 12 MB." }, { status: 413 });
    const ext = ({ "image/jpeg":"jpg", "image/jpg":"jpg", "image/png":"png", "image/webp":"webp", "image/gif":"gif", "image/avif":"avif", "image/svg+xml":"svg" })[mime] || "img";
    const key = crypto.randomUUID() + "." + ext;
    await bucket.put(key, bytes, { httpMetadata: { contentType: mime } });
    return Response.json({ key });
  } catch (error) {
    console.error("POST /api/upload:", error);
    return Response.json({ error: error?.message || "Falha ao gravar a imagem no R2." }, { status: 500 });
  }
}
