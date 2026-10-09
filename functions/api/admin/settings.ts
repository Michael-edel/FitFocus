import { requireUser, json } from '../_lib/auth';
import { requireDB } from '../_lib/db';
import { requireRole } from '../_lib/rbac';
import { requireAdminRequest } from '../_lib/admin_guard';
import { readAdminSettings, updateAdminSetting } from '../_lib/admin_config';
import { asString, isJsonObject } from '../_lib/json';
import { readJsonRequest, RequestBodyTooLargeError, SMALL_JSON_BODY_LIMIT_BYTES } from '../_lib/request_body';
import { logApiEvent, requestIdFor, withRequestId } from '../_lib/observability';

type Env = { DB: D1Database; AUTH_JWT_SECRET: string };
async function adminContext(request: Request, env: Env) { const user = await requireUser(request, env); requireRole(user, 'admin'); const db = requireDB(env); await requireAdminRequest(user, request, db); return { user, db }; }
const handleSettingsGet: PagesFunction<Env> = async ({ request, env }) => { let admin; try { admin = await adminContext(request, env); } catch (error) { return json({ error: (error as { code?: string }).code === 'FORBIDDEN' ? 'FORBIDDEN' : 'UNAUTH' }, (error as { code?: string }).code === 'FORBIDDEN' ? 403 : 401); } return json(await readAdminSettings(admin.db)); };
const handleSettingsPut: PagesFunction<Env> = async ({ request, env }) => {
  let admin; try { admin = await adminContext(request, env); } catch (error) { return json({ error: (error as { code?: string }).code === 'FORBIDDEN' ? 'FORBIDDEN' : 'UNAUTH' }, (error as { code?: string }).code === 'FORBIDDEN' ? 403 : 401); }
  let body: unknown = null; try { body = await readJsonRequest(request, SMALL_JSON_BODY_LIMIT_BYTES); } catch (error) { if (error instanceof RequestBodyTooLargeError) return json({ error: 'PAYLOAD_TOO_LARGE', message: 'Payload too large' }, 413); throw error; }
  if (!isJsonObject(body)) return json({ error: 'BAD_JSON' }, 400);
  const key = asString(body.key); const value = asString(body.value);
  if (!key) return json({ error: 'BAD_REQUEST', message: 'key required' }, 400);
  const result = await updateAdminSetting({ db: admin.db, key, value, adminUserId: admin.user.sub });
  if (result.kind === 'bad_setting') return json({ error: 'BAD_SETTING', message: 'Unknown setting' }, 400);
  if (result.kind === 'bad_value') return json({ error: 'BAD_VALUE', message: 'Invalid setting value' }, 400);
  return json({ ok: true, key: result.key, value: result.value });
};
export const onRequestGet: PagesFunction<Env> = async (context) => { const response = await handleSettingsGet(context); const requestId = requestIdFor(context.request); logApiEvent('admin.settings.get.response', { requestId, status: response.status }); return withRequestId(response, requestId); };
export const onRequestPut: PagesFunction<Env> = async (context) => { const response = await handleSettingsPut(context); const requestId = requestIdFor(context.request); logApiEvent('admin.settings.put.response', { requestId, status: response.status }); return withRequestId(response, requestId); };
