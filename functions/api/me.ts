/**
 * FITFOCUS v17_SAFE — /api/me (no D1 required)
 * Returns a "free" plan stub now. Later you can swap to D1/Stripe.
 */
export async function onRequestGet({ request }) {
  // For now we don't have auth/session. This endpoint is a forward-compat contract.
  // Client can start using it without breaking Free users.
  const body = {
    plan: "free",
    entitlements: {
      aiDailyLimit: 3,
      aiUnlimited: false
    }
  };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store"
    }
  });
}