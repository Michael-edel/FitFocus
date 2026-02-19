// Cloudflare Pages Function: /api/logout
// Revokes current session (if present) and clears ff_session cookie.

import { readCookie, verifySessionJwt } from "./_lib/auth";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  const isHttps =
    new URL(request.url).protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https" ||
    (request.headers.get("origin") || "").startsWith("https://");

  // Best-effort revoke
  try {
    const token = readCookie(request.headers.get("Cookie") || "", "ff_session");
    if (token && env.AUTH_JWT_SECRET && env.DB) {
      const payload: any = await verifySessionJwt(token, env.AUTH_JWT_SECRET);
      const sid = String(payload?.sid || "");
      const sub = String(payload?.sub || "");
      if (sid && sub) {
        await env.DB.prepare("UPDATE sessions SET revoked = 1 WHERE id = ? AND user_id = ?")
          .bind(sid, sub)
          .run();
      }
    }
  } catch {
    // ignore
  }

  const cookie = cookieSerialize("ff_session", "", {
    httpOnly: true,
    secure: isHttps,
    sameSite: "Lax",
    path: "/",
    maxAge: 0,
  });

  const headers = new Headers();
  headers.set("Content-Type", "application/json; charset=utf-8");
  headers.append("Set-Cookie", cookie);

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
};

type Env = { AUTH_JWT_SECRET?: string; DB?: any };

function cookieSerialize(
  name: string,
  value: string,
  opts: {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: "Lax" | "Strict" | "None";
    path?: string;
    maxAge?: number;
  }
) {
  const parts = [`${name}=${value}`];
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  if (opts.path) parts.push(`Path=${opts.path}`);
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  return parts.join("; ");
}
