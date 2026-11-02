/**
 * LUXX STORE AD - Cloudflare Worker
 * Bindings obrigatórios:
 *   D1: DB
 *   R2: bucket
 * Secrets:
 *   GITHUB_TOKEN
 *   PUBLISH_SECRET
 */
const OWNER = "trindadematheus71-del";
const REPO = "LUXX-STORE-AD-";
const BRANCH = "main";
const D1_KEY = "current";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400"
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...corsHeaders }
  });
}

function safeName(name) {
  return String(name || "asset").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
}

async function sha256Hex(input) {
  const digest = await crypto.subtle.digest("SHA-256", input);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function decodeDataUrl(dataUrl) {
  const match = /^data:([^;,]+)?(;base64)?,([\s\S]*)$/i.exec(dataUrl);
  if (!match) throw new Error("Arquivo em formato data URL inválido.");
  const mime = match[1] || "application/octet-stream";
  const payload = match[3];
  let bytes;
  if (match[2]) {
    const binary = atob(payload);
    bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
  } else {
    bytes = new TextEncoder().encode(decodeURIComponent(payload));
  }
  return { mime, bytes };
}

async function externalizeDataUrls(html, env) {
  const pattern = /data:([a-zA-Z0-9.+/-]+)(;base64)?,([^"'\\s<>)]*)/g;
  const matches = [...html.matchAll(pattern)];
  const replacements = new Map();

  for (const match of matches) {
    const dataUrl = match[0];
    if (replacements.has(dataUrl)) continue;
    const { mime, bytes } = decodeDataUrl(dataUrl);
    const hash = await sha256Hex(bytes);
    const ext = mime.includes("png") ? "png"
      : mime.includes("webp") ? "webp"
      : mime.includes("gif") ? "gif"
      : mime.includes("svg") ? "svg"
      : mime.includes("pdf") ? "pdf"
      : mime.includes("jpeg") || mime.includes("jpg") ? "jpg"
      : "bin";
    const key = `assets/${hash}.${ext}`;
    await env.bucket.put(key, bytes, {
      httpMetadata: { contentType: mime, cacheControl: "public, max-age=31536000, immutable" }
    });
    replacements.set(dataUrl, `https://luxx-store-api.luxxstoread.workers.dev/assets/${key}`);
  }

  for (const [original, url] of replacements) {
    html = html.split(original).join(url);
  }
  return { html, count: replacements.size };
}

async function githubRequest(path, token, init = {}) {
  return fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      "Authorization": `Bearer ${token}`,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "LUXX-STORE-AD-Publisher",
      ...(init.headers || {})
    }
  });
}

async function publish(request, env) {
  const auth = request.headers.get("Authorization") || "";
  if (!env.PUBLISH_SECRET || auth !== `Bearer ${env.PUBLISH_SECRET}`) {
    return json({ error: "Acesso não autorizado. Confira a senha de publicação." }, 401);
  }
  if (!env.GITHUB_TOKEN) return json({ error: "Secret GITHUB_TOKEN não configurado." }, 500);
  if (!env.DB || !env.bucket) return json({ error: "Confira os bindings DB e bucket." }, 500);

  let body;
  try { body = await request.json(); }
  catch { return json({ error: "O conteúdo enviado não é um JSON válido." }, 400); }

  if (typeof body.html !== "string" || !body.html.includes("LUXX_INITIAL_DATA")) {
    return json({ error: "HTML da loja inválido ou sem os dados iniciais." }, 400);
  }
  if (body.html.length > 45 * 1024 * 1024) {
    return json({ error: "Arquivo muito grande para uma única publicação. Reduza o tamanho das imagens." }, 413);
  }

  const extracted = body.html.match(/window\.LUXX_INITIAL_DATA\s*=\s*([\s\S]*?)\s*;\s*<\/script>/i);
  if (!extracted) return json({ error: "Não foi possível localizar os dados da loja no HTML." }, 400);

  let storeData;
  try { storeData = JSON.parse(extracted[1]); }
  catch { return json({ error: "Os dados da loja estão malformados." }, 400); }
  if (!storeData || !Array.isArray(storeData.products) || !Array.isArray(storeData.categories)) {
    return json({ error: "Estrutura de produtos/categorias inválida." }, 400);
  }

  try {
    const { html, count } = await externalizeDataUrls(body.html, env);
    const rewrittenData = html.match(/window\\.LUXX_INITIAL_DATA\\s*=\\s*([\\s\\S]*?)\\s*;\\s*<\\/script>/i);
    if (!rewrittenData) throw new Error("Não foi possível recuperar os dados após enviar as imagens ao R2.");
    const publicStoreData = JSON.parse(rewrittenData[1]);
    const dataJson = JSON.stringify(publicStoreData);
    await env.DB.prepare(
      "INSERT INTO store_state (id, data_json, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET data_json=excluded.data_json, updated_at=CURRENT_TIMESTAMP"
    ).bind(D1_KEY, dataJson).run();

    const filePath = `/repos/${OWNER}/${REPO}/contents/index.html`;
    const current = await githubRequest(filePath + `?ref=${encodeURIComponent(BRANCH)}`, env.GITHUB_TOKEN);
    let sha;
    if (current.ok) {
      const currentJson = await current.json();
      sha = currentJson.sha;
    } else if (current.status !== 404) {
      const detail = await current.text();
      return json({ error: `GitHub não permitiu consultar index.html (${current.status}): ${detail.slice(0, 300)}` }, 502);
    }

    const encoded = new TextEncoder().encode(html);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < encoded.length; i += chunkSize) {
      binary += String.fromCharCode(...encoded.subarray(i, i + chunkSize));
    }
    const content = btoa(binary);
    const commit = await githubRequest(filePath, env.GITHUB_TOKEN, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Publicação da loja LUXX STORE AD",
        content,
        branch: BRANCH,
        ...(sha ? { sha } : {})
      })
    });
    if (!commit.ok) {
      const detail = await commit.text();
      return json({ error: `Falha ao enviar para o GitHub (${commit.status}): ${detail.slice(0, 500)}` }, 502);
    }
    const result = await commit.json();
    return json({
      ok: true,
      products: storeData.products.length,
      images: count,
      commit: result.commit?.sha || null,
      message: "Publicação enviada ao GitHub. O Cloudflare Pages iniciará a implantação se estiver conectado ao repositório."
    });
  } catch (error) {
    return json({ error: error.message || "Erro interno durante a publicação." }, 500);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

    if (request.method === "GET" && url.pathname.startsWith("/assets/")) {
      const key = url.pathname.slice(1);
      const object = await env.bucket.get(key);
      if (!object) return new Response("Not found", { status: 404, headers: corsHeaders });
      const headers = new Headers(corsHeaders);
      object.writeHttpMetadata(headers);
      headers.set("ETag", object.httpEtag);
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
      return new Response(object.body, { headers });
    }

    if (request.method === "POST" && url.pathname === "/publish") {
      return publish(request, env);
    }

    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true, service: "LUXX STORE AD Publisher" });
    }
    return json({ error: "Rota não encontrada." }, 404);
  }
};
