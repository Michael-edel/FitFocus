// Cloudflare Pages Function: /api/logout
// Revokes current session (if present) and clears ff_session cookie.

import { readCookie, verifySessionJwt } from "./_lib/auth";
import { revokeSession } from "./_lib/session_revocation";
import { logApiEvent, requestIdFor, withRequestId } from './_lib/observability';

const handleLogoutPost: PagesFunction<Env> = async ({ request, env }) => {
  const isHttps =
    new URL(request.url).protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https" ||
    (request.headers.get("origin") || "").startsWith("https://");

  // Best-effort revoke
  try {
    const token = readCookie(request.headers.get("Cookie") || "", "ff_session");
    if (token && env.AUTH_JWT_SECRET && env.DB) {
      const payload = await verifySessionJwt(token, env.AUTH_JWT_SECRET);
      const sid = String(payload?.sid || "");
      const sub = String(payload?.sub || "");
      if (sid && sub) {
        await revokeSession(env.DB, sid, sub);
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

/** Correlates logout completion without recording session or user information. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const response = await handleLogoutPost(context);
  const requestId = requestIdFor(context.request);
  logApiEvent('auth.logout.response', { requestId, status: response.status });
  return withRequestId(response, requestId);
};

type Env = { AUTH_JWT_SECRET?: string; DB?: D1Database };

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
