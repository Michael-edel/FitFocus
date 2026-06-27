type Env = {
  VITE_GOOGLE_CLIENT_ID_LOCAL?: string;
  GOOGLE_CLIENT_ID_LOCAL?: string;
  VITE_GOOGLE_CLIENT_ID_PROD?: string;
  GOOGLE_CLIENT_ID_PROD?: string;
  REQUIRE_INVITE?: string;
  VITE_REQUIRE_INVITE?: string;
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const env = context.env || {};
  const googleClientIdLocal =
    env.VITE_GOOGLE_CLIENT_ID_LOCAL ||
    env.GOOGLE_CLIENT_ID_LOCAL ||
    '';
  const googleClientIdProd =
    env.VITE_GOOGLE_CLIENT_ID_PROD ||
    env.GOOGLE_CLIENT_ID_PROD ||
    '';

  const requireInvite =
    String(env.REQUIRE_INVITE ?? env.VITE_REQUIRE_INVITE ?? '').trim() === '1';

  return new Response(JSON.stringify({ googleClientIdLocal, googleClientIdProd, requireInvite }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
};
