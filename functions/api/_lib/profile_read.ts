import { migrateLegacyAccountByEmail, withProtectedFields } from './legacy_sync';
import { loadActivePlan, loadActivePlanByEmail } from './plans';
import { loadStoredProfile, type ProfileWriteUser } from './profile_write';

/** Load a current account profile with server-owned identity and subscription fields. */
export async function loadCurrentProfile(db: D1Database, user: ProfileWriteUser) {
  const storedProfile = await loadStoredProfile(db, user.sub);
  if (!storedProfile) return migrateLegacyAccountByEmail(db, user);

  const directPlan = await loadActivePlan(db, user.sub);
  const plan = directPlan === 'free'
    ? await loadActivePlanByEmail(db, user.email || '')
    : directPlan;
  return withProtectedFields(user, { ...storedProfile, plan });
}
