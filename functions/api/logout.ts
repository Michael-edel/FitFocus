// Cloudflare Pages Function: /api/logout
// Clears ff_session cookie. Must NOT force Secure on http://localhost.

export const onRequestPost: PagesFunction = async ({ request }) => {
  const isHttps =
    new URL(request.url).protocol === "https:" ||
    request.headers.get("x-forwarded-proto") === "https" ||
    (request.headers.get("origin") || "").startsWith("https://");

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
