import type { PagesFunction } from "@cloudflare/workers-types";
import { requireUser, json } from "../../_lib/auth";
import { requireBetaAccess } from "../../_lib/access";
import { requireDB } from "../../_lib/db";
import { ensureHuaweiConnectionsSchema, getHuaweiConfig, readHuaweiConnectionStatus, type HuaweiHealthEnv } from "../../_lib/huawei_health";
import { logApiEvent, requestIdFor, withRequestId } from '../../_lib/observability';

type Env = HuaweiHealthEnv & { DB: D1Database };

const handleHuaweiStatusGet: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
    await requireBetaAccess(env, user);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }
  const config = getHuaweiConfig(env, request);

  const db = requireDB(env);
  await ensureHuaweiConnectionsSchema(db);
  return json(await readHuaweiConnectionStatus({ db, userId: user.sub, configured: config.missing.length === 0 }));
};

/** Correlates status checks without logging connection state or wearable metadata. */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const response = await handleHuaweiStatusGet(context);
  const requestId = requestIdFor(context.request);
  logApiEvent('wearable.huawei.status.response', { requestId, status: response.status });
  return withRequestId(response, requestId);
};
