
/**
 * FitFocus: logout
 * POST /api/logout
 * Clears ff_session cookie.
 */

export async function onRequestPost({ request }: { request: Request }) {
  const isHttps = (new URL(request.url)).protocol === "https:";
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Set-Cookie": `ff_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax; ${isHttps ? "Secure;" : ""}`,
    },
  });
}
