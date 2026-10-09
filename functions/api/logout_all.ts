// Cloudflare Pages Function: /api/logout_all
// Revokes ALL sessions for current user and clears ff_session cookie.

import { requireUser, json } from "./_lib/auth";
import { revokeAllUserSessions } from "./_lib/session_revocation";
import { logApiEvent, requestIdFor, withRequestId } from './_lib/observability';

const handleLogoutAllPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const u = await requireUser(request, env);

    await revokeAllUserSessions(env.DB, u.sub);

    const isHttps =
      new URL(request.url).protocol === "https:" ||
      request.headers.get("x-forwarded-proto") === "https" ||
      (request.headers.get("origin") || "").startsWith("https://");

    const headers = new Headers();
    headers.append(
      "Set-Cookie",
      cookieSerialize("ff_session", "", {
        httpOnly: true,
        secure: isHttps,
        sameSite: "Lax",
        path: "/",
        maxAge: 0,
      })
    );

    return json({ ok: true }, 200, headers);
  } catch {
    return json({ ok: false, error: "UNAUTH" }, 401);
  }
};

/** Correlates global session revocation without recording session or user information. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const response = await handleLogoutAllPost(context);
  const requestId = requestIdFor(context.request);
  logApiEvent('auth.logout-all.response', { requestId, status: response.status });
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
