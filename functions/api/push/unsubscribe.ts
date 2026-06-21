import { requireUser, json } from "../_lib/auth";
import { requireDB } from "../_lib/db";
import { parsePushSubscription } from "../_lib/push";

type Env = {
  AUTH_JWT_SECRET?: string;
  DB?: D1Database;
};

export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }

  const body = await request.json().catch(() => null);
  const parsed = parsePushSubscription(body?.subscription || body);
  const endpoint = String(body?.endpoint || parsed?.endpoint || "").trim();
  if (!endpoint) return json({ error: "BAD_REQUEST" }, 400);

  const db = requireDB(env);
  const result = await db
    .prepare("DELETE FROM push_subscriptions WHERE user_id = ? AND endpoint = ?")
    .bind(user.sub, endpoint)
    .run();

  const removed = Number((result as { meta?: { changes?: number } }).meta?.changes || 0);

  return json({
    ok: true,
    removed,
  }, 200);
};
