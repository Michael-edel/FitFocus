import { json } from "../_lib/auth";
import { asString } from "../_lib/json";
import { readJsonObjectRequest, RequestBodyTooLargeError, SMALL_JSON_BODY_LIMIT_BYTES } from "../_lib/request_body";
import { logApiEvent, requestIdFor, withRequestId } from '../_lib/observability';
import { createBillingCheckout, type BillingCheckoutEnv } from '../_lib/billing_checkout';
import { requireStateUser, withSessionGuard } from '../_lib/state_session';

type Env = BillingCheckoutEnv;

async function handleCheckoutPost({ request, env }: { request: Request; env: Env }) {
  let user;
  try {
    user = await requireStateUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }

  let body = null;
  try {
    body = await readJsonObjectRequest(request, SMALL_JSON_BODY_LIMIT_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return json({ error: "PAYLOAD_TOO_LARGE", message: "Payload too large" }, 413);
    }
    throw error;
  }
  const checkout = await createBillingCheckout({ env, userId: user.sub, plan: asString(body?.plan) });
  if (!checkout.ok) return json({ error: checkout.reason }, checkout.reason === 'BAD_REQUEST' ? 400 : 500);
  return json({ url: checkout.url });
}

/** Correlates checkout outcomes without recording plan or Stripe payloads. */
export async function onRequestPost(context: { request: Request; env: Env }) {
  let response = await handleCheckoutPost(context);
  if (response.status !== 401) response = withSessionGuard(response, context.request, 'Billing');
  response.headers.set('Cache-Control', 'no-store');
  const requestId = requestIdFor(context.request);
  logApiEvent('billing.checkout.response', { requestId, status: response.status });
  return withRequestId(response, requestId);
}
