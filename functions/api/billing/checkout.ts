import Stripe from "stripe";
import { json, requireUser } from "../_lib/auth";

type Env = {
  AUTH_JWT_SECRET: string;
  DB: D1Database;
  STRIPE_SECRET_KEY: string;
  APP_URL: string;
};

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

  const { priceId } = await request.json().catch(() => ({}));
  if (!priceId || typeof priceId !== "string") return json({ error: "BAD_REQUEST" }, 400);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: env.APP_URL + "/?billing=success",
      cancel_url: env.APP_URL + "/?billing=cancel",
      subscription_data: {
        metadata: {
          ff_uid: user.sub
        }
      },
      metadata: {
        ff_uid: user.sub
      }
    });

    return json({ url: session.url });
  } catch (error: any) {
    return json({ error: String(error?.message || error) }, 500);
  }
}
