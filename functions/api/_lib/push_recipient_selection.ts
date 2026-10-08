import { normalizePushBrowserLabel, normalizePushDeviceLabel } from './push';
import { asBoolean, asString, asStringArray, safeJsonParseObject, type JsonObject } from './json';
import { normalizeProfileRecord } from './profile_contract';

export type SegmentInput = { query?: unknown; status?: unknown; plan?: unknown; wearable?: unknown; glucose?: unknown; measurements?: unknown; role?: unknown; familyId?: unknown; device?: unknown; browser?: unknown; userIds?: unknown };
export type PushRecipientRow = {
  id: string; user_id: string; endpoint: string; p256dh: string; auth: string; content_encoding: string | null;
  device_label: string | null; user_agent: string | null; created_at: number; updated_at: number; last_sent_at: number | null;
  last_error: string | null; enabled: number; email: string | null; user_created_at: number | null; deleted_at: string | null;
  deletion_scheduled_at: string | null; is_active: number | null; subscription_plan: string | null; subscription_status: string | null;
  current_period_end: number | null; profile_json: string | null; roles_csv: string | null; active_family_ids?: string | null;
};
export type Recipient = PushRecipientRow & { profile: JsonObject; roles: string[]; device: string; browser: string; plan: string; subscriptionStatus: string; active: boolean; familyIds: string[] };

export function toText(value: unknown, fallback = '') { return asString(value, fallback); }
export function toInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, Math.trunc(parsed))) : fallback;
}
export function normalizeStringArray(value: unknown) { return asStringArray(value); }

function splitList(value: unknown) { return String(value || '').split(',').map((item) => item.trim()).filter(Boolean); }
function recipientForRow(row: PushRecipientRow): Recipient {
  const profile = row.profile_json ? normalizeProfileRecord(safeJsonParseObject(String(row.profile_json))) : {};
  return {
    ...row,
    profile,
    roles: splitList(row.roles_csv),
    device: normalizePushDeviceLabel(row.device_label, row.user_agent),
    browser: normalizePushBrowserLabel(row.user_agent),
    plan: String(row.subscription_plan || profile.plan || 'free').toLowerCase(),
    subscriptionStatus: String(row.subscription_status || profile.subscriptionStatus || 'inactive').toLowerCase(),
    active: asBoolean(row.is_active) && !row.deleted_at,
    familyIds: splitList(row.active_family_ids),
  };
}

function matchesSegment(recipient: Recipient, segment: SegmentInput, userIds: Set<string>) {
  if (userIds.size && !userIds.has(recipient.user_id)) return false;
  const query = toText(segment.query);
  if (query) {
    const normalized = query.toLowerCase();
    if (![recipient.user_id, recipient.email || '', String(recipient.profile.name || '')].some((value) => String(value).toLowerCase().includes(normalized))) return false;
  }
  const status = toText(segment.status, 'all').toLowerCase();
  if (status === 'active' && !(recipient.is_active === 1 && !recipient.deleted_at)) return false;
  if (status === 'inactive' && !(recipient.is_active === 0 && !recipient.deleted_at)) return false;
  if (status === 'deleted' && !recipient.deleted_at) return false;
  if (toText(segment.plan, 'all').toLowerCase() !== 'all' && recipient.plan !== toText(segment.plan, 'all').toLowerCase()) return false;
  const wearableEnabled = asBoolean(recipient.profile.wearableEnabled);
  if (toText(segment.wearable, 'all').toLowerCase() === 'connected' && !wearableEnabled) return false;
  if (toText(segment.wearable, 'all').toLowerCase() === 'disconnected' && wearableEnabled) return false;
  const glucose = toText(segment.glucose, 'all').toLowerCase(), glucoseValue = recipient.profile.bloodGlucoseMmolL;
  if (glucose === 'yes' && glucoseValue == null) return false;
  if (glucose === 'no' && glucoseValue != null) return false;
  const measurements = toText(segment.measurements, 'all').toLowerCase();
  const history = Array.isArray(recipient.profile.measurementsHistory) ? recipient.profile.measurementsHistory : [];
  const hasMeasurements = history.length > 0 || recipient.profile.weight !== undefined || recipient.profile.restingPulse !== undefined || glucoseValue !== undefined || recipient.profile.bloodPressureSystolic !== undefined || recipient.profile.bloodPressureDiastolic !== undefined;
  if (measurements === 'yes' && !hasMeasurements) return false;
  if (measurements === 'no' && hasMeasurements) return false;
  const role = toText(segment.role, 'all').toLowerCase();
  if (role !== 'all' && !recipient.roles.includes(role)) return false;
  const familyId = toText(segment.familyId);
  if (familyId && !recipient.familyIds.includes(familyId)) return false;
  const device = toText(segment.device, 'all').toLowerCase(), browser = toText(segment.browser, 'all').toLowerCase();
  return (device === 'all' || recipient.device.toLowerCase() === device) && (browser === 'all' || recipient.browser.toLowerCase() === browser);
}

function sortRecipients(recipients: Recipient[], sort: string) {
  const order = sort.toLowerCase();
  const text = (a: string, b: string) => a.localeCompare(b, 'ru', { sensitivity: 'base' });
  const number = (a: number, b: number) => a - b;
  recipients.sort((a, b) => {
    switch (order) {
      case 'created_asc': return number(a.created_at, b.created_at);
      case 'created_desc': return number(b.created_at, a.created_at);
      case 'updated_asc': return number(a.updated_at, b.updated_at);
      case 'updated_desc': return number(b.updated_at, a.updated_at);
      case 'last_sent_asc': return number(Number(a.last_sent_at || 0), Number(b.last_sent_at || 0)) || number(b.updated_at, a.updated_at);
      case 'last_sent_desc': return number(Number(b.last_sent_at || 0), Number(a.last_sent_at || 0)) || number(b.updated_at, a.updated_at);
      case 'email_asc': return text(String(a.email || ''), String(b.email || '')) || number(b.updated_at, a.updated_at);
      case 'email_desc': return text(String(b.email || ''), String(a.email || '')) || number(b.updated_at, a.updated_at);
      case 'device_asc': return text(a.device, b.device) || number(b.updated_at, a.updated_at);
      case 'device_desc': return text(b.device, a.device) || number(b.updated_at, a.updated_at);
      case 'browser_asc': return text(a.browser, b.browser) || number(b.updated_at, a.updated_at);
      case 'browser_desc': return text(b.browser, a.browser) || number(b.updated_at, a.updated_at);
      case 'plan_asc': return text(a.plan, b.plan) || number(b.updated_at, a.updated_at);
      case 'plan_desc': return text(b.plan, a.plan) || number(b.updated_at, a.updated_at);
      default: return number(b.updated_at, a.updated_at);
    }
  });
}

/** Applies explicit user IDs and all admin-facing segment filters before pagination. */
export function selectPushRecipients(rows: PushRecipientRow[], segment: SegmentInput, userIds: Set<string>, sort: string, offset: number, limit: number) {
  const allRecipients = rows.map(recipientForRow);
  const matchedRecipients = allRecipients.filter((recipient) => matchesSegment(recipient, segment, userIds));
  sortRecipients(matchedRecipients, sort);
  return { allRecipients, matchedRecipients, selectedRecipients: matchedRecipients.slice(offset, offset + limit) };
}
