import Stripe from "stripe";
import { readRequestText, RequestBodyTooLargeError } from "../_lib/request_body";
import { logApiEvent, requestIdFor, withRequestId } from '../_lib/observability';

type Env = {
  DB: D1Database;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  PRICE_PRO_MONTHLY?: string;
  PRICE_PRO_YEARLY?: string;
  PRICE_FAMILY_MONTHLY?: string;
};

import { applyStripeSubscriptionUpdate, type SubscriptionLike } from '../_lib/billing_subscription';

export { applyStripeSubscriptionUpdate };

const MAX_STRIPE_WEBHOOK_BYTES = 1024 * 1024;

async function handleWebhookPost({ request, env }: { request: Request; env: Env }) {
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: "2023-10-16"
  });

  const sig = request.headers.get("stripe-signature");
  let rawBody = "";
  try {
    rawBody = await readRequestText(request, MAX_STRIPE_WEBHOOK_BYTES);
  } catch (err) {
    if (err instanceof RequestBodyTooLargeError) {
      return new Response("Webhook Error: payload too large", { status: 413 });
    }
    throw err;
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return new Response("Webhook Error: invalid signature", { status: 400 });
  }

  // Обработка событий подписки
  if (event.type === "customer.subscription.created" || 
      event.type === "customer.subscription.updated" || 
      event.type === "customer.subscription.deleted") {
    await applyStripeSubscriptionUpdate(env.DB, event.data.object as SubscriptionLike, env);
  }

  return new Response("ok", { status: 200 });
}

/** Correlates webhook outcomes without logging Stripe signatures or event content. */
export async function onRequestPost(context: { request: Request; env: Env }) {
  const response = await handleWebhookPost(context);
  const requestId = requestIdFor(context.request);
  logApiEvent('billing.webhook.response', { requestId, status: response.status });
  return withRequestId(response, requestId);
}
