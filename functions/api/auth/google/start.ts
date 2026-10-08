import type { PagesFunction } from "@cloudflare/workers-types";
import { startOAuthAuthorization } from "../_oauth_start";
import { logApiEvent, requestIdFor, withRequestId } from "../../_lib/observability";

type Env = { DB: D1Database; GOOGLE_CLIENT_ID: string; AUTH_JWT_SECRET: string; APP_URL?: string };

/** Records only the OAuth start outcome; state, nonce, invite code, and redirect stay private. */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const response = await startOAuthAuthorization({ request: context.request, env: context.env, clientId: context.env.GOOGLE_CLIENT_ID, authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth", callbackPath: "/api/auth/google/callback", scope: "openid email profile", extraParams: { prompt: "select_account", access_type: "online" } });
  const requestId = requestIdFor(context.request);
  logApiEvent("auth.google.start.response", { requestId, status: response.status });
  return withRequestId(response, requestId);
};
