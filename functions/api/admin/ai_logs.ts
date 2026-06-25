import { requireUser, json } from "../_lib/auth";
import { requireDB } from "../_lib/db";
import { requireRole } from "../_lib/rbac";
import { requireAdminRequest } from "../_lib/admin_guard";

function toInt(value: unknown, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

export async function onRequestGet({ request, env }: { request: Request; env: any }) {
  let user;
  try { user = await requireUser(request, env); } catch { return json({ error: "UNAUTH" }, 401); }
  try { requireRole(user, "admin"); } catch { return json({ error: "FORBIDDEN" }, 403); }
  const db = requireDB(env);
  await requireAdminRequest(user, request, db);


  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(200, toInt(url.searchParams.get("limit"), 50)));
  const userId = url.searchParams.get("user_id");
  const feature = url.searchParams.get("feature");

  let sql = "SELECT id, user_id, ts, feature, status, latency_ms, safe_mode, error FROM ai_events";
  const binds: any[] = [];
  const where: string[] = [];

  if (userId) { where.push("user_id = ?"); binds.push(userId); }
  if (feature) { where.push("feature = ?"); binds.push(feature); }
  if (where.length) sql += " WHERE " + where.join(" AND ");
  sql += " ORDER BY ts DESC LIMIT ?"; binds.push(limit);

  const rows = await env.DB.prepare(sql).bind(...binds).all();
  return json({ logs: rows.results || [] });
}
