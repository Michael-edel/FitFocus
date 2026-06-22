import { safeGetItem } from '../storage/utils';

export type OnboardingAnalyticsEvent =
  | 'onboarding_started'
  | 'onboarding_basic_completed'
  | 'aha_card_viewed'
  | 'aha_card_cta_clicked';

export type OnboardingAnalyticsRecord = {
  event: OnboardingAnalyticsEvent;
  ts: string;
  meta?: Record<string, string | number | boolean | null | undefined>;
};

const ONBOARDING_ANALYTICS_KEY = 'fitfocus.analytics.onboarding.v1';
const MAX_EVENTS = 100;

export function trackOnboardingEvent(
  event: OnboardingAnalyticsEvent,
  meta?: Record<string, string | number | boolean | null | undefined>,
) {
  try {
    const existing = safeGetItem<OnboardingAnalyticsRecord[]>(ONBOARDING_ANALYTICS_KEY, []);
    const next: OnboardingAnalyticsRecord[] = [
      ...existing,
      { event, ts: new Date().toISOString(), meta },
    ].slice(-MAX_EVENTS);
    localStorage.setItem(ONBOARDING_ANALYTICS_KEY, JSON.stringify(next));
  } catch {
    // local-only, best effort
  }
}

