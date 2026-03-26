import type { PagesFunction } from "@cloudflare/workers-types";

function json(body: any, status = 200, headers?: Headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: headers || new Headers({ "content-type": "application/json; charset=utf-8" }),
  });
}

function b64urlEncode(bytes: Uint8Array) {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function b64urlDecodeToBytes(s: string) {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + pad;
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function cookieSerialize(name: string, value: string, opts: { httpOnly?: boolean; secure?: boolean; sameSite?: "Lax" | "Strict" | "None"; path?: string; maxAge?: number } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (opts.maxAge !== undefined) parts.push(`Max-Age=${opts.maxAge}`);
  parts.push(`Path=${opts.path || "/"}`);
  if (opts.httpOnly) parts.push("HttpOnly");
  if (opts.secure) parts.push("Secure");
  if (opts.sameSite) parts.push(`SameSite=${opts.sameSite}`);
  return parts.join("; ");
}

async function hmacSha256Base64Url(secret: string, data: string) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return b64urlEncode(new Uint8Array(sig));
}

async function signSessionJwt(payload: any, secret: string, ttlSeconds: number) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, exp: now + ttlSeconds };
  const enc = new TextEncoder();
  const part1 = b64urlEncode(enc.encode(JSON.stringify(header)));
  const part2 = b64urlEncode(enc.encode(JSON.stringify(fullPayload)));
  const signingInput = `${part1}.${part2}`;
  const sig = await hmacSha256Base64Url(secret, signingInput);
  return `${signingInput}.${sig}`;
}

function getBaseUrl(req: Request) {
  const u = new URL(req.url);
  return `${u.protocol}//${u.host}`;
}

export const onRequestGet: PagesFunction<{
  DB: D1Database;
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  AUTH_JWT_SECRET: string;
  ADMIN_EMAILS?: string;
  BOOTSTRAP_ADMIN_EMAILS?: string;
}> = async ({ request, env }) => {
  try {
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
      return json({ error: "Missing GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET" }, 500);
    }
    if (!env.AUTH_JWT_SECRET) {
      return json({ error: "Missing AUTH_JWT_SECRET" }, 500);
    }

    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state") || "";
    if (!code) return json({ error: "Missing code" }, 400);
    if (!state.includes(".")) return json({ error: "Missing/invalid state" }, 400);

    const [stateB64, stateSig] = state.split(".");
    const rawState = new TextDecoder().decode(b64urlDecodeToBytes(stateB64));
    const expected = await hmacSha256Base64Url(env.AUTH_JWT_SECRET, rawState);
    if (expected !== stateSig) return json({ error: "Invalid state" }, 400);

    const parsed = JSON.parse(rawState) as { r: string; i?: string; n: string; t: number };
    const redirectAfter = parsed?.r || getBaseUrl(request);
    const inviteCode = parsed?.i || "";

    const baseUrl = getBaseUrl(request);
    const redirectUri = `${baseUrl}/api/auth/google/callback`;

    // Exchange code -> tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });
    const tokenJson: any = await tokenRes.json();
    if (!tokenRes.ok) {
      return json({ error: "Token exchange failed", details: tokenJson }, 502);
    }
    const idToken = tokenJson.id_token as string | undefined;
    if (!idToken) return json({ error: "No id_token returned" }, 502);

    // Validate token + get profile
    const infoRes = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`);
    const info: any = await infoRes.json();
    if (!infoRes.ok) return json({ error: "tokeninfo failed", details: info }, 502);
    if (info.aud !== env.GOOGLE_CLIENT_ID) return json({ error: "Invalid aud" }, 400);

    const user = {
      sub: String(info.sub),
      email: String(info.email || ""),
      name: String(info.name || info.given_name || ""),
      picture: String(info.picture || ""),
      email_verified: info.email_verified === "true" || info.email_verified === true,
    };

    // Upsert user
    const now = Math.floor(Date.now() / 1000);
    await env.DB.prepare(
      `INSERT INTO users (id, email, name, picture, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET email=excluded.email, name=excluded.name, picture=excluded.picture, updated_at=excluded.updated_at`
    )
      .bind(user.sub, user.email, user.name, user.picture, now, now)
      .run();

    // Closed beta invite handling
    const requireInvite = String((env as any).REQUIRE_INVITE || "").trim() === "1";

    const adminEmails = String((env as any).ADMIN_EMAILS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const bootstrapEmails = String((env as any).BOOTSTRAP_ADMIN_EMAILS || "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    const emailLc = user.email.toLowerCase();
    const listedAdmin = !!(user.email && adminEmails.includes(emailLc));
    const anyAdmin = bootstrapEmails.length && user.email
      ? await env.DB.prepare("SELECT 1 FROM user_roles WHERE role='admin' LIMIT 1").first()
      : null;
    const bootstrapAdminEligible = !!(bootstrapEmails.length && user.email && !anyAdmin && bootstrapEmails.includes(emailLc));

    const existingAccess = await env.DB.prepare(
      `SELECT
         EXISTS(SELECT 1 FROM invite_redemptions WHERE user_id = ?) AS has_redemption,
         EXISTS(SELECT 1 FROM user_roles WHERE user_id = ? AND role = 'admin') AS is_admin`
    ).bind(user.sub, user.sub).first<any>();

    const alreadyHasAccess = !!(existingAccess?.has_redemption || existingAccess?.is_admin || listedAdmin || bootstrapAdminEligible);

    if (!alreadyHasAccess && requireInvite && !inviteCode) {
      return Response.redirect(`${baseUrl}/?invite_error=required`, 302);
    }

    if (!alreadyHasAccess && inviteCode) {
      // idempotent: if already redeemed by this user, do not consume again
      const existing = await env.DB.prepare(
        "SELECT 1 as ok FROM invite_redemptions WHERE code = ? AND user_id = ? LIMIT 1"
      ).bind(inviteCode, user.sub).first<any>();

      if (!existing?.ok) {
        const upd = await env.DB.prepare(
          `UPDATE invite_codes
           SET uses = uses + 1
           WHERE code = ?
             AND revoked = 0
             AND (expires_at IS NULL OR expires_at > ?)
             AND uses < COALESCE(max_uses, 1)`
        ).bind(inviteCode, now).run();

        if (!upd?.changes) {
          return Response.redirect(`${baseUrl}/?invite_error=invalid`, 302);
        }

        await env.DB.prepare(
          "INSERT OR IGNORE INTO invite_redemptions (code, user_id, redeemed_at) VALUES (?, ?, ?)"
        ).bind(inviteCode, user.sub, now).run();
      }
    }

    // Admin role by email list
    if (listedAdmin) {
      await env.DB.prepare("INSERT OR IGNORE INTO user_roles (user_id, role) VALUES (?, 'admin')").bind(user.sub).run();
    }
    // Bootstrap admin (B2C-safe):
    // - only when there are NO admins yet
    // - only for emails listed in BOOTSTRAP_ADMIN_EMAILS
    if (bootstrapAdminEligible) {
      await env.DB.prepare("INSERT OR IGNORE INTO user_roles (user_id, role) VALUES (?, 'admin')").bind(user.sub).run();
    }


    // Session
    const sid = crypto.randomUUID();
    const ttl = 60 * 60 * 24 * 30; // 30d
    const expiresAt = now + ttl;
    const ua = request.headers.get("user-agent") || "";
    const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "";
    await env.DB.prepare(
      "INSERT INTO sessions (id, user_id, created_at, expires_at, revoked, user_agent, ip) VALUES (?, ?, ?, ?, 0, ?, ?)"
    )
      .bind(sid, user.sub, now, expiresAt, ua.slice(0, 500), String(ip).slice(0, 100))
      .run();

    const sessionJwt = await signSessionJwt(
      { v: 2, sub: user.sub, sid, email: user.email, name: user.name, picture: user.picture, iat: now },
      env.AUTH_JWT_SECRET,
      ttl
    );

    const headers = new Headers();
    const isHttps = new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";
    headers.append(
      "Set-Cookie",
      cookieSerialize("ff_session", sessionJwt, { httpOnly: true, secure: isHttps, sameSite: "Lax", path: "/", maxAge: ttl })
    );
    headers.set("Location", redirectAfter);
    return new Response(null, { status: 302, headers });
  } catch (e: any) {
    return json({ error: "Server error", details: String(e?.message || e) }, 500);
  }
};
