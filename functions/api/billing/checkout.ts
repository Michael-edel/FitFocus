import Stripe from "stripe";

export async function onRequestPost({ request, env }) {
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: "2023-10-16"
  });
  
  const { priceId } = await request.json();
  const uid = request.headers.get("X-FF-UID");

  if (!uid) {
    return new Response("Missing X-FF-UID", { status: 400 });
  }

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: env.APP_URL + "/?billing=success",
      cancel_url: env.APP_URL + "/?billing=cancel",
      subscription_data: {
        metadata: {
          ff_uid: uid
        }
      },
      metadata: {
        ff_uid: uid
      }
    });

    return new Response(JSON.stringify({ url: session.url }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
}