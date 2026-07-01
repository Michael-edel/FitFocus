import Stripe from "stripe";
import { json, requireUser } from "../_lib/auth";
import { asString } from "../_lib/json";
import { readJsonObjectRequest, RequestBodyTooLargeError, SMALL_JSON_BODY_LIMIT_BYTES } from "../_lib/request_body";

type Env = {
  AUTH_JWT_SECRET: string;
  DB: D1Database;
  STRIPE_SECRET_KEY: string;
  APP_URL: string;
  PRICE_PRO_MONTHLY?: string;
  PRICE_PRO_YEARLY?: string;
  PRICE_FAMILY_MONTHLY?: string;
};

export function resolveCheckoutPlanPrice(plan: string, env: Pick<Env, "PRICE_PRO_MONTHLY" | "PRICE_PRO_YEARLY" | "PRICE_FAMILY_MONTHLY">) {
  const normalized = String(plan || "").trim().toLowerCase();
  const priceId =
    normalized === "pro" ? env.PRICE_PRO_MONTHLY :
    normalized === "pro_yearly" ? env.PRICE_PRO_YEARLY :
    normalized === "family" ? env.PRICE_FAMILY_MONTHLY :
    null;
  return {
    normalizedPlan: normalized,
    priceId: priceId || null,
  };
}

export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  let user;
  try {
    user = await requireUser(request, env);
  } catch {
    return json({ error: "UNAUTH" }, 401);
  }

  const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: "2023-10-16"
  });

  let body = null;
  try {
    body = await readJsonObjectRequest(request, SMALL_JSON_BODY_LIMIT_BYTES);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return json({ error: "PAYLOAD_TOO_LARGE", message: "Payload too large" }, 413);
    }
    throw error;
  }
  const { normalizedPlan, priceId } = resolveCheckoutPlanPrice(asString(body?.plan), env);

  if (!priceId) return json({ error: "BAD_REQUEST" }, 400);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: env.APP_URL + "/?billing=success",
      cancel_url: env.APP_URL + "/?billing=cancel",
      subscription_data: {
        metadata: {
          ff_uid: user.sub,
          ff_plan: normalizedPlan,
        }
      },
      metadata: {
        ff_uid: user.sub,
        ff_plan: normalizedPlan,
      }
    });

    return json({ url: session.url });
  } catch {
    console.error("billing.checkout_failed");
    return json({ error: "CHECKOUT_FAILED" }, 500);
  }
}
