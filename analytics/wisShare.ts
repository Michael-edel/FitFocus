import { safeGetItem } from '../storage/utils';

export type WisShareEvent =
  | 'wis_share_clicked'
  | 'wis_share_success'
  | 'wis_share_failed';

export type WisShareRecord = {
  event: WisShareEvent;
  ts: string;
  meta?: Record<string, string | number | boolean | null | undefined>;
};

const WIS_SHARE_ANALYTICS_KEY = 'fitfocus.analytics.wis_share.v1';
const MAX_EVENTS = 100;

export function trackWisShareEvent(
  event: WisShareEvent,
  meta?: Record<string, string | number | boolean | null | undefined>,
) {
  try {
    const existing = safeGetItem<WisShareRecord[]>(WIS_SHARE_ANALYTICS_KEY, []);
    const next: WisShareRecord[] = [
      ...existing,
      { event, ts: new Date().toISOString(), meta },
    ].slice(-MAX_EVENTS);
    localStorage.setItem(WIS_SHARE_ANALYTICS_KEY, JSON.stringify(next));
  } catch {
    // local-only, best effort
  }
}
