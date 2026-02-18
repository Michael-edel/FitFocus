export const onRequestGet: PagesFunction = async (context) => {
  const env = (context as any).env || {};
  const googleClientIdLocal =
    env.VITE_GOOGLE_CLIENT_ID_LOCAL ||
    env.GOOGLE_CLIENT_ID_LOCAL ||
    '';
  const googleClientIdProd =
    env.VITE_GOOGLE_CLIENT_ID_PROD ||
    env.GOOGLE_CLIENT_ID_PROD ||
    '';

  return new Response(JSON.stringify({ googleClientIdLocal, googleClientIdProd }), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
};
