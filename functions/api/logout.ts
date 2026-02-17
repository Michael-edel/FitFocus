// Cloudflare Pages Function: /api/logout
export const onRequestPost: PagesFunction = async () => {
  const headers = new Headers();
  headers.append("Set-Cookie", "ff_session=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax");
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { ...Object.fromEntries(headers), "Content-Type": "application/json; charset=utf-8" } as any,
  });
};
