// Cloudflare Pages Function: /api/logout_all
// Revokes ALL sessions for current user and clears ff_session cookie.

import { requireUser, json } from "./_lib/auth";

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  try {
    const u = await requireUser(request, env);

    await env.DB.prepare("UPDATE sessions SET revoked = 1 WHERE user_id = ?")
      .bind(u.sub)
      .run();

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
  } catch (e: any) {
    return json({ ok: false, error: String(e?.message || e) }, 401);
  }
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
