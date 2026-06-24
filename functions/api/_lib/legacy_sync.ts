import { loadActivePlanByEmail } from "./plans";
import { nowMs } from "./db";

export async function loadLegacyProfileByEmail(
  db: D1Database,
  email: string,
): Promise<{ userId: string; profile: Record<string, unknown>; version: number } | null> {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) return null;
  try {
    const row = await db
      .prepare(
        `SELECT up.user_id, up.profile_json, up.version
         FROM user_profiles up
         JOIN users u ON u.id = up.user_id
         WHERE lower(u.email) = ?
         ORDER BY up.updated_at DESC
         LIMIT 1`
      )
      .bind(normalized)
      .first<{ user_id?: string; profile_json?: string; version?: number }>();
    if (!row?.profile_json || !row.user_id) return null;
    const parsed = JSON.parse(String(row.profile_json)) as Record<string, unknown>;
    return parsed && typeof parsed === "object"
      ? { userId: row.user_id, profile: parsed, version: Number(row.version || 1) }
      : null;
  } catch {
    return null;
  }
}

export function withProtectedFields(
  user: { sub: string; email?: string; name?: string; picture?: string },
  profile: Record<string, unknown>,
) {
  const plan = String(profile.plan || "free");
  const normalizedPlan = plan === "pro" || plan === "family" ? plan : "free";
  return {
    ...profile,
    id: user.sub,
    googleSub: user.sub,
    email: user.email,
    name: typeof profile.name === "string" && profile.name.trim().length ? profile.name : (user.name ?? "Пользователь"),
    picture: profile.picture ?? user.picture,
    plan: normalizedPlan,
    planTier: normalizedPlan === "free" ? "free" : "pro",
    version: typeof profile.version === "number" ? profile.version : Number(profile.version || 1),
  };
}

export async function migrateLegacyStateToCurrentUser(db: D1Database, fromUserId: string, toUserId: string) {
  if (!fromUserId || !toUserId || fromUserId === toUserId) return;
  const oldPrefix = `fitfocus_data_${fromUserId}_`;
  const newPrefix = `fitfocus_data_${toUserId}_`;
  const now = nowMs();

  try {
    const legacyItems = await db
      .prepare(
        `SELECT k, v, version, updated_at
         FROM user_kv
         WHERE user_id = ? AND k LIKE ?`
      )
      .bind(fromUserId, `${oldPrefix}%`)
      .all<{ k: string; v: string; version?: number; updated_at?: number }>();

    const statements: D1PreparedStatement[] = [];
    for (const item of legacyItems.results || []) {
      if (!item?.k) continue;
      const nextKey = item.k.startsWith(oldPrefix) ? `${newPrefix}${item.k.slice(oldPrefix.length)}` : item.k;
      statements.push(
        db.prepare(
          `INSERT INTO user_kv (user_id, k, v, updated_at, version)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(user_id, k) DO UPDATE SET v = excluded.v, updated_at = excluded.updated_at, version = excluded.version`
        ).bind(toUserId, nextKey, item.v, item.updated_at ?? now, item.version ?? 1)
      );
    }
    if (statements.length) {
      await db.batch(statements);
    }
  } catch {
    // best-effort only
  }

  const replaceTables: Array<{ sql: string; binds: (string | number)[] }> = [
    { sql: "UPDATE user_profiles SET user_id = ? WHERE user_id = ?", binds: [toUserId, fromUserId] },
    { sql: "UPDATE subscriptions SET user_id = ? WHERE user_id = ?", binds: [toUserId, fromUserId] },
    { sql: "UPDATE user_roles SET user_id = ? WHERE user_id = ?", binds: [toUserId, fromUserId] },
    { sql: "UPDATE invite_redemptions SET user_id = ? WHERE user_id = ?", binds: [toUserId, fromUserId] },
    { sql: "UPDATE usage_daily SET user_id = ? WHERE user_id = ?", binds: [toUserId, fromUserId] },
    { sql: "UPDATE ai_events SET user_id = ? WHERE user_id = ?", binds: [toUserId, fromUserId] },
    { sql: "UPDATE recipes SET user_id = ? WHERE user_id = ?", binds: [toUserId, fromUserId] },
    { sql: "UPDATE weekly_menu_items SET user_id = ? WHERE user_id = ?", binds: [toUserId, fromUserId] },
    {
      sql: "UPDATE shopping_checked SET scope_id = ? WHERE scope_id = ?",
      binds: [`personal:${toUserId}`, `personal:${fromUserId}`],
    },
    {
      sql: "UPDATE shopping_checked SET scope_id = ? WHERE scope_id = ?",
      binds: [`personal:${toUserId}`, fromUserId],
    },
    { sql: "UPDATE weekly_menu_portions SET user_id = ? WHERE user_id = ?", binds: [toUserId, fromUserId] },
    { sql: "UPDATE family_members SET user_id = ? WHERE user_id = ?", binds: [toUserId, fromUserId] },
    { sql: "UPDATE families SET owner_user_id = ? WHERE owner_user_id = ?", binds: [toUserId, fromUserId] },
    { sql: "UPDATE family_invites SET created_by_user_id = ? WHERE created_by_user_id = ?", binds: [toUserId, fromUserId] },
    { sql: "UPDATE family_invites SET used_by_user_id = ? WHERE used_by_user_id = ?", binds: [toUserId, fromUserId] },
    { sql: "UPDATE admin_events SET admin_user_id = ? WHERE admin_user_id = ?", binds: [toUserId, fromUserId] },
    { sql: "UPDATE admin_events SET target_user_id = ? WHERE target_user_id = ?", binds: [toUserId, fromUserId] },
    { sql: "UPDATE admin_sessions SET admin_user_id = ? WHERE admin_user_id = ?", binds: [toUserId, fromUserId] },
  ];

  for (const stmt of replaceTables) {
    try {
      await db.prepare(stmt.sql).bind(...stmt.binds).run();
    } catch {
      // Ignore missing tables in older schemas.
    }
  }
}

export async function migrateLegacyAccountByEmail(
  db: D1Database,
  user: { sub: string; email?: string; name?: string; picture?: string },
): Promise<Record<string, unknown> | null> {
  const legacy = await loadLegacyProfileByEmail(db, user.email || "");
  if (!legacy || legacy.userId === user.sub) return null;

  await migrateLegacyStateToCurrentUser(db, legacy.userId, user.sub);
  const serverPlan = await loadActivePlanByEmail(db, user.email || "");
  const migratedProfile = withProtectedFields(user, {
    ...legacy.profile,
    plan: serverPlan,
    version: legacy.version,
  });

  const t = nowMs();
  await db
    .prepare(
      "INSERT INTO user_profiles (user_id, profile_json, updated_at, version) VALUES (?, ?, ?, ?) " +
        "ON CONFLICT(user_id) DO UPDATE SET profile_json = excluded.profile_json, updated_at = excluded.updated_at, version = excluded.version"
    )
    .bind(user.sub, JSON.stringify(migratedProfile), t, Number(migratedProfile.version || legacy.version || 1))
    .run();

  return migratedProfile;
}
