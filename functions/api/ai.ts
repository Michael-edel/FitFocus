// Cloudflare Pages Function: /api/ai
// Robust Gemini proxy: normalizes `contents` to an array and returns helpful error bodies.
export interface Env {
  GEMINI_API_KEY: string;
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-headers", "content-type, authorization");
  headers.set("access-control-allow-methods", "POST, OPTIONS");
  return new Response(JSON.stringify(body), { ...init, headers });
}

function normalizeContents(input: any): any[] | null {
  if (!input) return null;
  const arr = Array.isArray(input) ? input : [input];
  // Normalize inlineData.data if someone accidentally sends data URLs
  for (const c of arr) {
    if (!c?.parts || !Array.isArray(c.parts)) continue;
    for (const p of c.parts) {
      const d = p?.inlineData?.data;
      if (typeof d === "string" && d.startsWith("data:") && d.includes("base64,")) {
        p.inlineData.data = d.split("base64,").pop();
      }
    }
  }
  return arr;
}

export const onRequestOptions: PagesFunction<Env> = async () =>
  new Response(null, {
    status: 204,
    headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, authorization",
      "access-control-allow-methods": "POST, OPTIONS",
    },
  });

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let body: any;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, { status: 400 });
  }

  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) {
    // Misconfigured environment in Cloudflare Pages
    return jsonResponse(
      { error: "GEMINI_API_KEY is not set in Pages Functions environment" },
      { status: 500 }
    );
  }

  const model = typeof body?.model === "string" ? body.model : "gemini-1.5-flash";
  const feature = body?.feature;

  const contents = normalizeContents(body?.contents);
  if (!contents || contents.length === 0) {
    return jsonResponse(
      { error: "Missing `contents`", hint: "Expected contents: [{ parts: [...] }]" },
      { status: 400 }
    );
  }

  // Gemini REST: generateContent
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  // Map client `config` -> Gemini `generationConfig` (JSON mode / schema)
  const generationConfig: any = {};
  if (body?.config?.responseMimeType) generationConfig.responseMimeType = body.config.responseMimeType;
  if (body?.config?.responseSchema) generationConfig.responseSchema = body.config.responseSchema;

  const upstreamPayload: any = {
    contents,
  };
  if (Object.keys(generationConfig).length) upstreamPayload.generationConfig = generationConfig;

  // Optional: you may add safetySettings here later.
  // upstreamPayload.safetySettings = [...]

  try {
    const upstream = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(upstreamPayload),
    });

    const text = await upstream.text();
    let data: any = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!upstream.ok) {
      // Bubble up upstream error with details for debugging in browser Network->Response
      return jsonResponse(
        {
          error: "Gemini request failed",
          status: upstream.status,
          statusText: upstream.statusText,
          model,
          feature,
          upstream: data,
        },
        { status: 400 }
      );
    }

    return jsonResponse(data, { status: 200 });
  } catch (err: any) {
    return jsonResponse(
      { error: "Upstream fetch crashed", message: String(err?.message || err) },
      { status: 500 }
    );
  }
};
