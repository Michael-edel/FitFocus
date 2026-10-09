import type { PagesFunction } from "@cloudflare/workers-types";
import { requireUser, json } from "../../_lib/auth";
import { requireBetaAccess } from "../../_lib/access";
import { requireDB } from "../../_lib/db";
import { ensureHuaweiConnectionsSchema, type HuaweiHealthEnv } from "../../_lib/huawei_health";
import { disconnectHuaweiProfile } from '../../_lib/huawei_disconnect';
import { logApiEvent, requestIdFor, withRequestId } from "../../_lib/observability";

type Env = HuaweiHealthEnv & { DB: D1Database };

const handleHuaweiDisconnectPost: PagesFunction<Env> = async ({ request, env }) => {
  let user;
  try {
    user = await requireUser(request, env);
    await requireBetaAccess(env, user);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }
  const db = requireDB(env);
  await ensureHuaweiConnectionsSchema(db);
  const result = await disconnectHuaweiProfile({ db, user });
  if (result.kind === 'conflict') return json({ error: 'PROFILE_CONFLICT', profile: result.profile, version: result.version }, 409);
  return json({ disconnected: true, profile: result.profile, version: result.version });
};

/** Correlates disconnect outcomes without logging connection or profile details. */
export const onRequestPost: PagesFunction<Env> = async (context) => {
  const response = await handleHuaweiDisconnectPost(context);
  const requestId = requestIdFor(context.request);
  logApiEvent("wearable.huawei.disconnect.response", { requestId, status: response.status });
  return withRequestId(response, requestId);
};
