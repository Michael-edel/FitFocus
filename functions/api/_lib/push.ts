import { nowMs, uuid } from "./db";

export type PushEnv = {
  DB?: D1Database;
  PUSH_VAPID_PUBLIC_KEY?: string;
  PUSH_VAPID_PRIVATE_KEY?: string;
  PUSH_VAPID_SUBJECT?: string;
};

export type PushSubscriptionRow = {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  content_encoding: string | null;
  device_label: string | null;
  user_agent: string | null;
  created_at: number;
  updated_at: number;
  last_sent_at: number | null;
  last_error: string | null;
  enabled: number;
};

export type PushSubscriptionPayload = {
  endpoint?: string;
  expirationTime?: number | null;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
};

function getDeviceLabelFallback(userAgent?: string | null) {
  const ua = userAgent || "";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua)) return "Android";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Macintosh/i.test(ua)) return "Mac";
  if (/Linux/i.test(ua)) return "Linux";
  return "Устройство";
}

export function normalizePushDeviceLabel(label?: string | null, userAgent?: string | null) {
  const trimmed = String(label || "").trim();
  if (trimmed) return trimmed.slice(0, 120);
  return getDeviceLabelFallback(userAgent).slice(0, 120);
}

export function parsePushSubscription(payload: PushSubscriptionPayload | null | undefined) {
  const endpoint = String(payload?.endpoint || "").trim();
  const p256dh = String(payload?.keys?.p256dh || "").trim();
  const auth = String(payload?.keys?.auth || "").trim();
  const contentEncoding = "aes128gcm";
  if (!endpoint || !p256dh || !auth) return null;
  return { endpoint, p256dh, auth, contentEncoding };
}

export function hasPushConfig(env: PushEnv): boolean {
  return Boolean(env.PUSH_VAPID_PUBLIC_KEY && env.PUSH_VAPID_PRIVATE_KEY && env.PUSH_VAPID_SUBJECT);
}

export function getPushConfigError(env: PushEnv): string | null {
  if (hasPushConfig(env)) return null;
  return "PUSH_CONFIG";
}

async function loadWebPush() {
  const mod = await import("web-push");
  return (mod as any).default ?? mod;
}

export async function sendPushNotification(
  env: PushEnv,
  subscription: Pick<PushSubscriptionRow, "endpoint" | "p256dh" | "auth" | "content_encoding">,
  payload: Record<string, unknown>,
) {
  if (getPushConfigError(env)) throw new Error("PUSH_CONFIG");
  const webpush = await loadWebPush();
  webpush.setVapidDetails(env.PUSH_VAPID_SUBJECT!, env.PUSH_VAPID_PUBLIC_KEY!, env.PUSH_VAPID_PRIVATE_KEY!);
  const pushSubscription = {
    endpoint: subscription.endpoint,
    keys: {
      p256dh: subscription.p256dh,
      auth: subscription.auth,
    },
  };
  return webpush.sendNotification(pushSubscription, JSON.stringify(payload), {
    TTL: 60 * 60 * 24 * 7,
  });
}

export function buildPushPayload(input: {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
  icon?: string;
  badge?: string;
  actions?: Array<{ action: string; title: string }>;
  data?: Record<string, unknown>;
}) {
  return {
    title: input.title || "FitFocus",
    body: input.body || "У вас новое уведомление от FitFocus.",
    url: input.url || "/",
    tag: input.tag || `fitfocus-${uuid()}`,
    icon: input.icon || "/icon.svg",
    badge: input.badge || "/icon.svg",
    actions: input.actions || [{ action: "open", title: "Открыть" }],
    data: {
      ...(input.data || {}),
      url: input.url || "/",
      createdAt: nowMs(),
    },
  };
}
