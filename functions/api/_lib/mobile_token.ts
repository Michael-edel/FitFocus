import { signSessionJwt } from '../auth/_oauth';

export type MobileTokenUser = {
  sub: string;
  sid: string;
  email?: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
};

type SessionRow = { id?: string; expires_at?: number; revoked?: number };

export async function issueMobileToken(input: {
  db: D1Database;
  secret: string;
  user: MobileTokenUser;
  now?: () => number;
}) {
  const now = (input.now || Date.now)();
  const session = await input.db
    .prepare('SELECT id, expires_at, revoked FROM sessions WHERE id = ? AND user_id = ? LIMIT 1')
    .bind(input.user.sid, input.user.sub)
    .first<SessionRow>();
  if (!session || Number(session.revoked || 0) === 1 || Number(session.expires_at || 0) <= Math.floor(now / 1000)) return null;

  const ttl = 60 * 60 * 24 * 30;
  const token = await signSessionJwt({
    v: 2, sub: input.user.sub, sid: input.user.sid, email: input.user.email,
    email_verified: input.user.emailVerified, name: input.user.name, picture: input.user.picture,
    aud: 'mobile', iat: Math.floor(now / 1000),
  }, input.secret, ttl);
  return {
    token,
    tokenType: 'Bearer',
    expiresAt: now + ttl * 1000,
    user: { id: input.user.sub, email: input.user.email, name: input.user.name, picture: input.user.picture },
  };
}
