import Stripe from "stripe";

type Env = {
  DB: D1Database;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  PRICE_PRO_MONTHLY?: string;
  PRICE_PRO_YEARLY?: string;
  PRICE_FAMILY_MONTHLY?: string;
};

export async function onRequestPost({ request, env }: { request: Request; env: Env }) {
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: "2023-10-16"
  });

  const sig = request.headers.get("stripe-signature");
  const rawBody = await request.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, env.STRIPE_WEBHOOK_SECRET);
  } catch (err: any) {
    return new Response(`Webhook Error: ${String(err?.message || err)}`, { status: 400 });
  }

  // Обработка событий подписки
  if (event.type === "customer.subscription.created" || 
      event.type === "customer.subscription.updated" || 
      event.type === "customer.subscription.deleted") {
    
    const sub = event.data.object;
    const uid = sub.metadata?.ff_uid;

    if (uid) {
      const status = sub.status; // active, trialing, past_due, canceled
      const periodEnd = sub.current_period_end ? sub.current_period_end * 1000 : null;
      const priceId = sub.items?.data?.[0]?.price?.id;

      let plan = "free";
      if (status === "active" || status === "trialing") {
        if (priceId === env.PRICE_PRO_MONTHLY || priceId === env.PRICE_PRO_YEARLY) plan = "pro";
        if (priceId === env.PRICE_FAMILY_MONTHLY) plan = "family";
      }

      await env.DB.prepare(
        `INSERT INTO subscriptions (user_id, plan, status, stripe_customer_id, stripe_subscription_id, current_period_end, updated_at) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
         ON CONFLICT(user_id) DO UPDATE SET plan=?2, status=?3, stripe_customer_id=?4, stripe_subscription_id=?5, current_period_end=?6, updated_at=?7`
      ).bind(
        uid, 
        plan, 
        status, 
        sub.customer?.toString() || null, 
        sub.id?.toString() || null, 
        periodEnd, 
        Date.now()
      ).run();
    }
  }

  return new Response("ok", { status: 200 });
}
