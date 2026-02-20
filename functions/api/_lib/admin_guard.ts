// Admin guard for Pages Functions (RBAC + admin session tracking)
import type { SessionUser } from "./auth";
import { requireRole } from "./rbac";
import { touchAdminSession } from "./admin_sessions";

export async function requireAdminRequest(user: SessionUser, request: Request, db: D1Database) {
  requireRole(user, "admin");

  // Best-effort admin session tracking
  try {
    const ip = request.headers.get("CF-Connecting-IP") || request.headers.get("X-Forwarded-For") || "";
    const ua = request.headers.get("User-Agent") || "";
    await touchAdminSession(db, { adminUserId: user.sub, sessionId: user.sid, ip, userAgent: ua });
  } catch {}
}
