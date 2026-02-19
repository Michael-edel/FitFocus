// Shared auth utilities for Pages Functions (HS256 JWT in ff_session cookie)
export type SessionUser = { sub: string; sid: string; email?: string; name?: string; picture?: string };

export function readCookie(cookieHeader: string, name: string): string | null {
  const parts = (cookieHeader || "").split(";").map((p) => p.trim());
  for (const p of parts) if (p.startsWith(name + "=")) return p.slice(name.length + 1);
  return null;
}

function b64urlToBytes(s: string): Uint8Array {
  s = s.replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacVerify(data: string, signatureB64Url: string, secret: string): Promise<boolean> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  return crypto.subtle.verify("HMAC", key, b64urlToBytes(signatureB64Url), new TextEncoder().encode(data));
}

function parseJwtPayload(token: string): any | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const jsonStr = new TextDecoder().decode(b64urlToBytes(parts[1]));
    return JSON.parse(jsonStr);
  } catch {
    return null;
  }
}

export async function verifySessionJwt(token: string, secret: string): Promise<any | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [h, p, sig] = parts;
  const data = `${h}.${p}`;
  const ok = await hmacVerify(data, sig, secret);
  if (!ok) return null;
  const payload = parseJwtPayload(token);
  if (!payload) return null;
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && now > payload.exp) return null;
  return payload;
}

export async function requireUser(
  request: Request,
  env: { AUTH_JWT_SECRET?: string; DB?: any }
): Promise<SessionUser> {
  const token = readCookie(request.headers.get("Cookie") || "", "ff_session");
  if (!token) throw new Error("UNAUTH");
  if (!env.AUTH_JWT_SECRET) throw new Error("AUTH_CONFIG");
  const payload = await verifySessionJwt(token, env.AUTH_JWT_SECRET);
  if (!payload?.sub) throw new Error("UNAUTH");

  // Enterprise layer: enforce server-tracked sessions (logout-all, revoke, device control)
  const sid = String(payload.sid || "");
  if (!sid) throw new Error("UNAUTH"); // force re-login if cookie is legacy without sid
  if (!env.DB) throw new Error("DB_CONFIG");

  const now = Math.floor(Date.now() / 1000);
  const s = await env.DB.prepare(
    "SELECT id, revoked, expires_at FROM sessions WHERE id = ? AND user_id = ? LIMIT 1"
  )
    .bind(sid, payload.sub)
    .first();

  if (!s) throw new Error("UNAUTH");
  if (Number(s.revoked || 0) === 1) throw new Error("UNAUTH");
  if (Number(s.expires_at || 0) <= now) throw new Error("UNAUTH");

  return {
    sub: payload.sub,
    sid,
    email: payload.email,
    name: payload.name,
    picture: payload.picture,
  };
}

export function json(data: any, status = 200, headers?: Headers) {
  const h = headers ? new Headers(headers) : new Headers();
  h.set("Content-Type", "application/json; charset=utf-8");
  h.set("Cache-Control", "no-store");
  return new Response(JSON.stringify(data), { status, headers: h });
}

export function errRu(code: string): { code: string; message: string } {
  const map: Record<string, string> = {
    UNAUTH: "Вы не авторизованы. Войдите через Google.",
    AUTH_CONFIG: "Сервер не настроен: отсутствует AUTH_JWT_SECRET.",
    DB_CONFIG: "Сервер не настроен: отсутствует база данных.",
    NOT_FOUND: "Не найдено.",
    LIMIT: "Лимит достигнут. Попробуйте позже.",
    BAD_REQUEST: "Некорректный запрос.",
    INVITE_INVALID: "Неверный или просроченный код приглашения.",
    FAMILY_LIMIT: "В семейном режиме максимум 5 человек.",
    FORBIDDEN: "Недостаточно прав.",
  };
  return { code, message: map[code] || "Произошла ошибка. Попробуйте ещё раз." };
}
