// GET /api/admin/admin_events - admin audit events (admin-only)
// Supports filters and CSV export: ?q=...&action=...&from=YYYY-MM-DD&to=YYYY-MM-DD&limit=50&offset=0&format=csv
import { requireUser, json } from "../_lib/auth";
import { requireDB } from "../_lib/db";
import { requireRole } from "../_lib/rbac";
import { requireAdminRequest } from "../_lib/admin_guard";

type Env = { DB: D1Database; AUTH_JWT_SECRET: string };

function parseDateParam(v: string | null): number | null {
  if (!v) return null;
  const s = v.trim();
  if (!s) return null;
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    // if looks like seconds, convert to ms
    return n < 2_000_000_000 ? n * 1000 : n;
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

function csvEscape(v: any): string {
  const s = String(v ?? "");
  if (/[\n\r",]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
  return s;
}

export const onRequestGet: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try { user = await requireUser(request, env); } catch { return json({ error: "UNAUTH" }, 401); }
  try { requireRole(user, "admin"); } catch { return json({ error: "FORBIDDEN" }, 403); }

  const db = requireDB(env);
  await requireAdminRequest(user, request, db);

  const url = new URL(request.url);
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get("limit") || "50")));
  const offset = Math.max(0, Number(url.searchParams.get("offset") || "0"));

  const q = (url.searchParams.get("q") || "").trim();
  const action = (url.searchParams.get("action") || "").trim();
  const fromTs = parseDateParam(url.searchParams.get("from"));
  const toTs = parseDateParam(url.searchParams.get("to"));
  const format = (url.searchParams.get("format") || "").toLowerCase();

  const where: string[] = [];
  const binds: any[] = [];

  if (action) { where.push("e.action = ?"); binds.push(action); }
  if (fromTs !== null) { where.push("e.ts >= ?"); binds.push(fromTs); }
  if (toTs !== null) { where.push("e.ts <= ?"); binds.push(toTs); }
  if (q) {
    where.push("(LOWER(COALESCE(au.email,'')) LIKE ? OR LOWER(COALESCE(tu.email,'')) LIKE ? OR LOWER(COALESCE(e.action,'')) LIKE ?)");
    const like = `%${q.toLowerCase()}%`;
    binds.push(like, like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const { results } = await db.prepare(`
    SELECT e.id, e.ts, e.action,
           e.admin_user_id, au.email as admin_email,
           e.target_user_id, tu.email as target_email,
           e.meta_json
    FROM admin_events e
    LEFT JOIN users au ON au.id = e.admin_user_id
    LEFT JOIN users tu ON tu.id = e.target_user_id
    ${whereSql}
    ORDER BY e.ts DESC
    LIMIT ? OFFSET ?
  `).bind(...binds, limit, offset).all<any>();

  const events = results || [];

  if (format === "csv") {
    const header = ["ts", "action", "admin_email", "target_email", "meta_json"];
    const lines = [header.join(",")];
    for (const e of events) {
      lines.push([
        csvEscape(new Date(Number(e.ts || 0)).toISOString()),
        csvEscape(e.action),
        csvEscape(e.admin_email),
        csvEscape(e.target_email),
        csvEscape(e.meta_json),
      ].join(","));
    }
    const body = lines.join("\n");
    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Disposition": "attachment; filename=\"admin_events.csv\"",
      },
    });
  }

  return json({ ok: true, events, limit, offset });
};
