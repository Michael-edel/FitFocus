export const onRequestGet: PagesFunction<{ DB: D1Database }> = async ({ env }) => {
  const r = await env.DB.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;"
  ).all();

  return new Response(JSON.stringify(r.results ?? r, null, 2), {
    headers: { "content-type": "application/json; charset=utf-8" },
  });
};
