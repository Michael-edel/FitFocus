import Stripe from "stripe";

type Env = {
  DB: D1Database;
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  PRICE_PRO_MONTHLY?: string;
  PRICE_PRO_YEARLY?: string;
  PRICE_FAMILY_MONTHLY?: string;
};

type SubscriptionLike = {
  id?: string;
  status?: string;
  customer?: { toString(): string } | string | null;
  current_period_end?: number | null;
  metadata?: { ff_uid?: string | null } | null;
  items?: { data?: Array<{ price?: { id?: string | null } | null }> } | null;
};

function planForSubscription(status: string, priceId: string | null | undefined, env: Pick<Env, "PRICE_PRO_MONTHLY" | "PRICE_PRO_YEARLY" | "PRICE_FAMILY_MONTHLY">) {
  if (status !== "active" && status !== "trialing") return "free";
  if (priceId === env.PRICE_PRO_MONTHLY || priceId === env.PRICE_PRO_YEARLY) return "pro";
  if (priceId === env.PRICE_FAMILY_MONTHLY) return "family";
  return null;
}

async function resolveSubscriptionUserId(db: D1Database, sub: SubscriptionLike): Promise<string> {
  const metadataUid = String(sub.metadata?.ff_uid || "").trim();
  if (metadataUid) return metadataUid;

  const subscriptionId = sub.id?.toString() || null;
  const customerId = sub.customer?.toString() || null;
  if (!subscriptionId && !customerId) return "";

  const row = await db
    .prepare(
      `SELECT user_id
       FROM subscriptions
       WHERE (?1 IS NOT NULL AND stripe_subscription_id = ?1)
          OR (?2 IS NOT NULL AND stripe_customer_id = ?2)
       ORDER BY updated_at DESC
       LIMIT 1`
    )
    .bind(subscriptionId, customerId)
    .first<{ user_id: string }>();

  return String(row?.user_id || "").trim();
}

export async function applyStripeSubscriptionUpdate(db: D1Database, sub: SubscriptionLike, env: Pick<Env, "PRICE_PRO_MONTHLY" | "PRICE_PRO_YEARLY" | "PRICE_FAMILY_MONTHLY">) {
  const uid = await resolveSubscriptionUserId(db, sub);
  if (!uid) return { ok: false, reason: "MISSING_UID" };

  const target = await db
    .prepare("SELECT id FROM users WHERE id = ? AND is_active = 1 AND deleted_at IS NULL LIMIT 1")
    .bind(uid)
    .first<{ id: string }>();
  if (!target?.id) return { ok: false, reason: "USER_NOT_FOUND" };

  const status = String(sub.status || "unknown");
  const priceId = sub.items?.data?.[0]?.price?.id || null;
  const plan = planForSubscription(status, priceId, env);
  if (!plan) return { ok: false, reason: "UNKNOWN_PRICE" };

  const periodEnd = sub.current_period_end ? sub.current_period_end * 1000 : null;
  await db.prepare(
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

  return { ok: true, user_id: uid, plan, status };
}

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
    await applyStripeSubscriptionUpdate(env.DB, event.data.object as SubscriptionLike, env);
  }

  return new Response("ok", { status: 200 });
}
