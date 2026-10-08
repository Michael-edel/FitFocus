import { ensureAuthSchema, json } from "../_lib/auth";
import { completeGoogleLogin } from "../_lib/google_login";
import { asString, isJsonObject, type JsonObject } from "../_lib/json";
import { readJsonObjectRequest, RequestBodyTooLargeError, SMALL_JSON_BODY_LIMIT_BYTES } from "../_lib/request_body";
import { cookieSerialize, signSessionJwt } from "./_oauth";
import { logApiEvent, requestIdFor, withRequestId } from "../_lib/observability";
// Cloudflare Pages Function: /api/auth/google
// Accepts Google Identity Services "credential" (ID token), validates it via Google tokeninfo,
// then issues our own signed session JWT in HttpOnly cookie.

const AUTH_UNAVAILABLE = { error: "AUTH_UNAVAILABLE" };

async function safeResponseJson(response: Response): Promise<JsonObject> {
  const parsed = await response.json().catch(() => null);
  return isJsonObject(parsed) ? parsed : {};
}

const handleGoogleIdentityPost: PagesFunction<Env> = async (ctx) => {
  try {
    const { request, env } = ctx;

    let body: JsonObject | null = null;
    try {
      body = await readJsonObjectRequest(request, SMALL_JSON_BODY_LIMIT_BYTES);
    } catch (err) {
      if (err instanceof RequestBodyTooLargeError) {
        return json({ error: "PAYLOAD_TOO_LARGE", message: "Payload too large" }, 413);
      }
      throw err;
    }
    const credential = body?.credential;
    if (!credential || typeof credential !== "string") {
      return json({ error: "Missing credential" }, 400);
    }

    const allowedAud = [
      env.GOOGLE_CLIENT_ID,
      env.GOOGLE_CLIENT_ID_LOCAL,
      env.GOOGLE_CLIENT_ID_PROD,
      env.VITE_GOOGLE_CLIENT_ID,
      env.VITE_GOOGLE_CLIENT_ID_LOCAL,
      env.VITE_GOOGLE_CLIENT_ID_PROD,
    ].filter(Boolean) as string[];
    if (allowedAud.length === 0) return json(AUTH_UNAVAILABLE, 500);
    if (!env.AUTH_JWT_SECRET) return json(AUTH_UNAVAILABLE, 500);

    // Validate token with Google (simple + reliable, no crypto libs needed).
    const tokenInfoUrl = "https://oauth2.googleapis.com/tokeninfo?id_token=" + encodeURIComponent(credential);
    const r = await fetch(tokenInfoUrl, { method: "GET" });
    const info = await safeResponseJson(r);
    if (!r.ok) {
      return json({ error: "Invalid Google token" }, 401);
    }

    // Basic checks
    if (!allowedAud.includes(String(info.aud || ""))) return json({ error: "Token aud mismatch" }, 401);
    if (info.iss !== "https://accounts.google.com" && info.iss !== "accounts.google.com") {
      return json({ error: "Token iss mismatch" }, 401);
    }

    const user = {
      sub: String(info.sub || ""),
      email: String(info.email || ""),
      name: String(info.name || info.given_name || ""),
      picture: String(info.picture || ""),
      email_verified: String(info.email_verified || "") === "true",
    };

    const now = Math.floor(Date.now() / 1000);
    if (!env.DB) return json(AUTH_UNAVAILABLE, 500);
    await ensureAuthSchema(env.DB);

    const requireInvite = String(env.REQUIRE_INVITE || "").trim() === "1";
    const inviteCode = requireInvite ? asString(body?.inviteCode) : "";
    const ip =
      request.headers.get("cf-connecting-ip") ||
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "";
    const login = await completeGoogleLogin({
      db: env.DB,
      user,
      inviteCode,
      now,
      requireInvite,
      adminEmails: env.ADMIN_EMAILS,
      userAgent: request.headers.get("user-agent") || "",
      ip: String(ip),
    });
    if (login.kind === "invite-required") return json({ error: "INVITE_REQUIRED" }, 403);
    if (login.kind === "invalid-invite") return json({ error: "INVITE_INVALID" }, 403);
    const ttl = 60 * 60 * 24 * 30;


    const session = await signSessionJwt(
      {
        v: 2,
        sub: user.sub,
        sid: login.sid,
        email: user.email,
        email_verified: user.email_verified,
        name: user.name,
        picture: user.picture,
        iat: now,
      },
      env.AUTH_JWT_SECRET,      ttl
    );

    const headers = new Headers();
    const isHttps = new URL(request.url).protocol === "https:" || request.headers.get("x-forwarded-proto") === "https";

    headers.append(
      "Set-Cookie",
      cookieSerialize("ff_session", session, {
        httpOnly: true,
        secure: isHttps,
        sameSite: "Lax",
        path: "/",
                maxAge: ttl,
      })
    );

    return json({ ok: true, user }, 200, headers);
  } catch {
    return json({ error: "Server error" }, 500);
  }
};

/** Records only the sign-in outcome; credentials and identity data stay private. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const response = await handleGoogleIdentityPost(context);
  const requestId = requestIdFor(context.request);
  logApiEvent("auth.google.identity.response", { requestId, status: response.status });
  return withRequestId(response, requestId);
};

type Env = {
  AUTH_JWT_SECRET: string;
  DB: D1Database;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_ID_LOCAL?: string;
  GOOGLE_CLIENT_ID_PROD?: string;
  VITE_GOOGLE_CLIENT_ID?: string;
  VITE_GOOGLE_CLIENT_ID_LOCAL?: string;
  VITE_GOOGLE_CLIENT_ID_PROD?: string;
  REQUIRE_INVITE?: string;
  ADMIN_EMAILS?: string;
};
