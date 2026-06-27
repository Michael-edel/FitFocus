// Admin guard for Pages Functions (RBAC + admin session tracking)
// Robust: supports both call styles:
//   1) requireAdminRequest(request, env)
//   2) requireAdminRequest(user, request, db)
//
// Always verifies admin role against DB (user_roles) using the session JWT `sub`.

import type { SessionUser } from "./auth";
import { requireUser } from "./auth";
import { touchAdminSession } from "./admin_sessions";

type EnvLike = { DB?: D1Database; AUTH_JWT_SECRET?: string };
type ForbiddenError = Error & { code?: string };
type RequestLike = Request | undefined;

function forbidden(): never {
  const err: ForbiddenError = new Error("FORBIDDEN");
  err.code = "FORBIDDEN";
  throw err;
}

async function isAdmin(db: D1Database, userId: string): Promise<boolean> {
  const res = await db
    .prepare("SELECT 1 as ok FROM user_roles WHERE user_id = ? AND role = 'admin' LIMIT 1")
    .bind(userId)
    .all();
  return (res.results?.length || 0) > 0;
}

export async function requireAdminRequest(
  a: Request | SessionUser,
  b?: Request | EnvLike,
  c?: D1Database
): Promise<SessionUser> {
  // Style (request, env)
  if (a instanceof Request) {
    const request = a;
    const env = (b || {}) as EnvLike;
    const user = await requireUser(request, env);
    const db = env.DB;
    if (!db) throw new Error("DB_CONFIG");

    if (!(await isAdmin(db, user.sub))) forbidden();

    // Best-effort admin session tracking
    try {
      const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "";
      const ua = request.headers.get("User-Agent") || "";
      await touchAdminSession(db, { adminUserId: user.sub, sessionId: user.sid, ip, userAgent: ua });
    } catch {}

    return user;
  }

  // Style (user, request, db)
  const user: SessionUser = a;
  const request: RequestLike = b instanceof Request ? b : undefined;
  const db = c;

  if (!db) throw new Error("DB_CONFIG");
  if (!(await isAdmin(db, user.sub))) forbidden();

  if (request) {
    // Best-effort admin session tracking
    try {
      const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "";
      const ua = request.headers.get("User-Agent") || "";
      await touchAdminSession(db, { adminUserId: user.sub, sessionId: user.sid, ip, userAgent: ua });
    } catch {}
  }

  return user;
}
