// RBAC helpers (Enterprise Layer)
import type { SessionUser } from "./auth";

type ForbiddenError = Error & { code?: string };

export function hasRole(user: SessionUser, role: string): boolean {
  return Array.isArray(user.roles) && user.roles.includes(role);
}

export function requireRole(user: SessionUser, role: string): void {
  if (!hasRole(user, role)) {
    const err: ForbiddenError = new Error("FORBIDDEN");
    err.code = "FORBIDDEN";
    throw err;
  }
}
