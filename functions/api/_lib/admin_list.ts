type AdminRow = {
  id: string;
  email?: string | null;
  name?: string | null;
  picture?: string | null;
  created_at?: number | null;
};

/** Reads the bounded list of active administrator accounts for the console. */
export async function listAdministrators(db: D1Database) {
  const result = await db.prepare(`
    SELECT u.id, u.email, u.name, u.picture, u.created_at
    FROM users u
    JOIN user_roles r ON r.user_id = u.id AND r.role = 'admin'
    WHERE u.deleted_at IS NULL
    ORDER BY u.created_at DESC
    LIMIT 200
  `).all<AdminRow>();
  return result.results || [];
}
