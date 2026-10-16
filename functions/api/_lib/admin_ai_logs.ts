type AiLogRow = {
  id: string;
  user_id: string;
  ts: number;
  feature: string;
  status: number;
  latency_ms?: number | null;
  safe_mode?: number | boolean | null;
  error?: string | null;
};

function boundedInt(value: unknown, fallback: number, minimum: number, maximum: number) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.trunc(number)));
}

/** Reads a bounded filtered page of AI event records for the administrator console. */
export async function readAdminAiLogs(db: D1Database, searchParams: URLSearchParams) {
  const limit = boundedInt(searchParams.get('limit'), 50, 1, 200);
  const userId = searchParams.get('user_id');
  const feature = searchParams.get('feature');
  let sql = 'SELECT id, user_id, ts, feature, status, latency_ms, safe_mode, error FROM ai_events';
  const bindings: Array<string | number> = [];
  const where: string[] = [];

  if (userId) { where.push('user_id = ?'); bindings.push(userId); }
  if (feature) { where.push('feature = ?'); bindings.push(feature); }
  if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
  sql += ' ORDER BY ts DESC LIMIT ?';
  bindings.push(limit);

  const result = await db.prepare(sql).bind(...bindings).all<AiLogRow>();
  return { logs: result.results || [], limit };
}
