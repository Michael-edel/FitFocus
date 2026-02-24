// RBAC helpers (Enterprise Layer)
import type { SessionUser } from "./auth";

export function hasRole(user: SessionUser, role: string): boolean {
  return Array.isArray(user.roles) && user.roles.includes(role);
}

export function requireRole(user: SessionUser, role: string): void {
  if (!hasRole(user, role)) {
    const err: any = new Error("FORBIDDEN");
    err.code = "FORBIDDEN";
    throw err;
  }
}
