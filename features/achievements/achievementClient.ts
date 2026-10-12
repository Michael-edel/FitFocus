import type { AchievementDefinition } from '../../achievements/catalog';
import type { AchievementEvaluationContext } from '../../achievements/engine';
import { isRecord, parseJson } from '../../safeJson';
import { DurableOutbox, type OutboxReadGuard } from '../../storage/durableOutbox';
import { prepareAchievementSession, requestAchievementJson, type AchievementSessionOptions } from '../../services/achievementSession';
import type { AchievementCheckReason, UnlockedAchievement } from '../../useAchievements';

export type AchievementSnapshot = {
  enabled: boolean;
  catalog: AchievementDefinition[];
  unlocked: UnlockedAchievement[];
  newlyUnlocked: AchievementDefinition[];
  loading: boolean;
};
export const emptyAchievements = (): AchievementSnapshot => ({ enabled: true, catalog: [], unlocked: [], newlyUnlocked: [], loading: false });
const COUNTER_PREFIX = 'fitfocus.achievements.counters.v1:';
const CHECK_THROTTLE_MS = 500;
const MAX_PENDING_CHECKS = 5;
type Check = {
  reason: AchievementCheckReason;
  context: AchievementEvaluationContext;
  resolve: (result: AchievementDefinition[]) => void;
};

function definition(value: unknown): value is AchievementDefinition {
  return isRecord(value) && ['key', 'tier', 'category', 'title', 'description'].every(key => typeof value[key] === 'string');
}
function unlocked(value: unknown): UnlockedAchievement | null {
  if (!isRecord(value) || typeof value.key !== 'string' || !Number.isFinite(Number(value.unlocked_at))) return null;
  return {
    key: value.key, unlocked_at: Number(value.unlocked_at), tier: typeof value.tier === 'string' ? value.tier : '',
    source: typeof value.source === 'string' ? value.source : null,
    created_at: Number.isFinite(Number(value.created_at)) ? Number(value.created_at) : undefined,
  };
}
function incrementCounter(accountId: string, key: string): number {
  try {
    const parsed = parseJson(localStorage.getItem(`${COUNTER_PREFIX}${accountId}`) ?? '{}');
    const counters = isRecord(parsed) ? Object.fromEntries(Object.entries(parsed)
      .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))) : {};
    const next = Number(counters[key] || 0) + 1;
    localStorage.setItem(`${COUNTER_PREFIX}${accountId}`, JSON.stringify({ ...counters, [key]: next }));
    return next;
  } catch { return 1; }
}

/** One login and page lifetime owns every load, queued context, resolver and HTTP attempt. */
export class AchievementClient {
  private snapshot = emptyAchievements();
  private generation = 0;
  private active = false;
  private controllers = new Set<AbortController>();
  private loadController?: AbortController;
  private queue: Check[] = [];
  private outstanding = new Set<Check>();
  private timer?: ReturnType<typeof setTimeout>;
  private lastCheckAt = -Infinity;
  private readonly outbox: DurableOutbox;

  constructor(private readonly options: AchievementSessionOptions & {
    accountId: string;
    loginGuard: OutboxReadGuard;
    isCurrentSession: () => boolean;
    getContext: () => AchievementEvaluationContext;
    onChange: (snapshot: AchievementSnapshot) => void;
  }) { this.outbox = options.outbox ?? new DurableOutbox(); }

  private current(generation = this.generation): boolean {
    return this.active && generation === this.generation && this.options.isCurrentSession();
  }
  private publish(patch: Partial<AchievementSnapshot>): void {
    if (!this.current()) return;
    this.snapshot = { ...this.snapshot, ...patch }; this.options.onChange(this.snapshot);
  }
  activate(): void {
    this.invalidate(); this.active = true; this.lastCheckAt = -Infinity;
    this.snapshot = emptyAchievements(); this.publish({});
  }
  private async captureAttemptGuard(generation: number): Promise<OutboxReadGuard | null> {
    const { active, fence } = await this.outbox.sessionState();
    const login = this.options.loginGuard;
    if (!this.current(generation) || login.accountId !== this.options.accountId || active?.accountId !== login.accountId
      || active.serverSessionId !== login.serverSessionId || active.pause) return null;
    // The login binding comes from bootstrap, not whichever cookie/IDB session is present at a delayed send.
    // Epoch and fence belong to this attempt; an explicit resume of the same server login can start a new one.
    return { accountId: active.accountId, serverSessionId: login.serverSessionId, sessionEpoch: active.sessionEpoch, authFence: fence };
  }
  invalidate(): void {
    this.active = false; this.generation += 1;
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined; this.queue = [];
    for (const controller of this.controllers) controller.abort();
    this.controllers.clear(); this.loadController = undefined;
    for (const check of this.outstanding) check.resolve([]);
    this.outstanding.clear();
  }
  private async request(controller: AbortController, generation: number, context?: AchievementEvaluationContext) {
    const guard = await this.captureAttemptGuard(generation);
    if (!guard || !this.current(generation) || controller.signal.aborted) return null;
    const session = await prepareAchievementSession(guard, controller, () => this.current(generation), { ...this.options, outbox: this.outbox });
    if (!this.current(generation)) return null;
    return requestAchievementJson(session, context);
  }
  async load(): Promise<void> {
    if (!this.current()) return;
    this.loadController?.abort();
    const controller = new AbortController(); this.loadController = controller; this.controllers.add(controller);
    const generation = this.generation;
    const current = () => this.current(generation) && !controller.signal.aborted;
    this.publish({ loading: true });
    try {
      const result = await this.request(controller, generation);
      if (!current()) return;
      if (!result?.response.ok) throw new Error('ACHIEVEMENTS_LOAD_FAILED');
      const data = result.body;
      if (data?.enabled === false) { this.publish({ ...emptyAchievements(), enabled: false }); return; }
      const loaded = Array.isArray(data?.unlocked) ? data.unlocked.map(unlocked).filter((item): item is UnlockedAchievement => item !== null) : [];
      const seen = new Set(loaded.map(item => item.key));
      this.publish({
        enabled: true, catalog: Array.isArray(data?.catalog) ? data.catalog.filter(definition) : [],
        // A GET begun before a successful check cannot remove the new, monotonic unlock.
        unlocked: [...loaded, ...this.snapshot.unlocked.filter(item => !seen.has(item.key))],
      });
    } catch { if (current()) this.publish(emptyAchievements()); }
    finally {
      this.controllers.delete(controller);
      if (current()) this.publish({ loading: false });
      if (this.loadController === controller) this.loadController = undefined;
    }
  }
  check(reason: AchievementCheckReason, patch: AchievementEvaluationContext = {}): Promise<AchievementDefinition[]> {
    if (!this.current() || !this.snapshot.enabled) return Promise.resolve([]);
    // Both context and callback belong to this instance; old producers cannot address a new client's queue.
    const context = { ...this.options.getContext(), ...patch, source: reason };
    return new Promise(resolve => {
      const check = { reason, context, resolve }; this.outstanding.add(check);
      const elapsed = Date.now() - this.lastCheckAt;
      if (elapsed >= CHECK_THROTTLE_MS && this.timer === undefined) {
        this.lastCheckAt = Date.now(); void this.run([check], this.generation); return;
      }
      const existing = this.queue.filter(item => item.reason === reason);
      for (const item of existing) item.context = context;
      // Coalesced events retain all callers, with the latest context for that reason.
      this.queue.push(check);
      const reasons = [...new Set(this.queue.map(item => item.reason))];
      if (reasons.length > MAX_PENDING_CHECKS) {
        const dropped = reasons[0];
        const discarded = this.queue.filter(item => item.reason === dropped);
        this.queue = this.queue.filter(item => item.reason !== dropped);
        for (const item of discarded) this.finish(item, []);
      }
      if (this.timer === undefined) {
        const generation = this.generation;
        this.timer = setTimeout(() => {
          this.timer = undefined;
          if (!this.current(generation)) {
            // Login invalidation can precede React cleanup (for example a failed replacement login).
            if (generation === this.generation) this.invalidate();
            return;
          }
          const queue = this.queue; this.queue = []; this.lastCheckAt = Date.now();
          void this.run(queue, generation);
        }, Math.max(0, CHECK_THROTTLE_MS - elapsed));
      }
    });
  }
  private finish(check: Check, result: AchievementDefinition[]): void {
    if (this.outstanding.delete(check)) check.resolve(result);
  }
  private async run(queue: Check[], generation: number): Promise<void> {
    for (const reason of new Set(queue.map(item => item.reason))) {
      const checks = queue.filter(item => item.reason === reason);
      let definitions: AchievementDefinition[] = [];
      const controller = new AbortController(); this.controllers.add(controller);
      try {
        if (!this.current(generation) || !this.snapshot.enabled) continue;
        const context = { ...checks[checks.length - 1].context };
        // Counter writes are owned and occur only after the original session has been proven current.
        const guard = await this.captureAttemptGuard(generation);
        if (!guard) continue;
        const session = await prepareAchievementSession(guard, controller, () => this.current(generation), { ...this.options, outbox: this.outbox });
        if (!this.current(generation) || controller.signal.aborted) continue;
        if (reason === 'ai_photo_success') { context.aiPhotoCount = incrementCounter(this.options.accountId, 'aiPhotoCount'); context.hasAiPhoto = true; }
        if (reason === 'wis_share_success') context.wisShareCount = incrementCounter(this.options.accountId, 'wisShareCount');
        if (reason === 'pdf_report_generated') context.pdfReportCount = incrementCounter(this.options.accountId, 'pdfReportCount');
        const result = await requestAchievementJson(session, context);
        if (!this.current(generation) || controller.signal.aborted || !result.response.ok) continue;
        const data = result.body;
        if (data?.enabled === false) { this.publish({ ...emptyAchievements(), enabled: false }); continue; }
        const raw = Array.isArray(data?.newlyUnlocked) ? data.newlyUnlocked : [];
        const additions = raw.map(unlocked).filter((item): item is UnlockedAchievement => item !== null);
        definitions = raw.filter(definition);
        const seen = new Set(this.snapshot.unlocked.map(item => item.key));
        this.publish({
          catalog: Array.isArray(data?.catalog) ? data.catalog.filter(definition) : this.snapshot.catalog,
          unlocked: [...additions.filter(item => !seen.has(item.key)), ...this.snapshot.unlocked],
          newlyUnlocked: [...this.snapshot.newlyUnlocked, ...definitions],
        });
      } catch { /* Optional achievements never turn a failed/obsolete request into a successful unlock. */ }
      finally { this.controllers.delete(controller); for (const check of checks) this.finish(check, definitions); }
    }
  }
  dismissToast(): void { this.publish({ newlyUnlocked: this.snapshot.newlyUnlocked.slice(1) }); }
}
