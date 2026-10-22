export type AdminEventRow = {
  id: string;
  ts: number;
  action: string;
  admin_user_id?: string | null;
  admin_email?: string | null;
  target_user_id?: string | null;
  target_email?: string | null;
  meta_json?: string | null;
};

function parseDateParam(value: string | null): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/^\d+$/.test(trimmed)) {
    const timestamp = Number(trimmed);
    return timestamp < 2_000_000_000 ? timestamp * 1000 : timestamp;
  }
  const timestamp = Date.parse(trimmed);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function boundedInt(value: unknown, fallback: number, minimum: number, maximum: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.trunc(number)));
}

function csvEscape(value: unknown): string {
  const text = String(value ?? '');
  return /[\n\r",]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Reads a bounded, filtered audit-event page without exposing request context to SQL assembly. */
export async function readAdminEvents(db: D1Database, searchParams: URLSearchParams) {
  const limit = boundedInt(searchParams.get('limit'), 50, 1, 500);
  const offset = boundedInt(searchParams.get('offset'), 0, 0, Number.MAX_SAFE_INTEGER);
  const action = (searchParams.get('action') || '').trim();
  const query = (searchParams.get('q') || '').trim();
  const fromTs = parseDateParam(searchParams.get('from'));
  const toTs = parseDateParam(searchParams.get('to'));
  const where: string[] = [];
  const bindings: Array<string | number> = [];

  if (action) { where.push('e.action = ?'); bindings.push(action); }
  if (fromTs !== null) { where.push('e.ts >= ?'); bindings.push(fromTs); }
  if (toTs !== null) { where.push('e.ts <= ?'); bindings.push(toTs); }
  if (query) {
    where.push("(LOWER(COALESCE(au.email,'')) LIKE ? OR LOWER(COALESCE(tu.email,'')) LIKE ? OR LOWER(COALESCE(e.action,'')) LIKE ?)");
    const like = `%${query.toLowerCase()}%`;
    bindings.push(like, like, like);
  }

  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const result = await db.prepare(`
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
  `).bind(...bindings, limit, offset).all<AdminEventRow>();

  return { events: result.results || [], limit, offset };
}

/** Generates a spreadsheet-safe CSV representation of the already authorized audit-event page. */
export function exportAdminEventsCsv(events: AdminEventRow[]): string {
  const lines = [['ts', 'action', 'admin_email', 'target_email', 'meta_json'].join(',')];
  for (const event of events) {
    lines.push([
      csvEscape(new Date(Number(event.ts || 0)).toISOString()),
      csvEscape(event.action),
      csvEscape(event.admin_email),
      csvEscape(event.target_email),
      csvEscape(event.meta_json),
    ].join(','));
  }
  return lines.join('\n');
}
