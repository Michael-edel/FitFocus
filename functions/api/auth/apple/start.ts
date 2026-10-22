import type { PagesFunction } from "@cloudflare/workers-types";
import { startOAuthAuthorization } from "../_oauth_start";
import { logApiEvent, requestIdFor, withRequestId } from "../../_lib/observability";

type Env = { APPLE_CLIENT_ID: string; AUTH_JWT_SECRET: string; APP_URL?: string };

/** Records only the OAuth start outcome; state, nonce, invite code, and redirect stay private. */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  const response = await startOAuthAuthorization({ request: context.request, env: context.env, clientId: context.env.APPLE_CLIENT_ID, authorizationUrl: "https://appleid.apple.com/auth/authorize", callbackPath: "/api/auth/apple/callback", scope: "name email", extraParams: { response_mode: "form_post" } });
  const requestId = requestIdFor(context.request);
  logApiEvent("auth.apple.start.response", { requestId, status: response.status });
  return withRequestId(response, requestId);
};
