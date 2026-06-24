import React, { useEffect, useMemo, useState } from "react";
import { ShieldCheck, ToggleLeft, ToggleRight, Users, KeyRound, Activity, RefreshCcw, Search, Trash2, ChevronRight, Clock3, BadgeInfo, LifeBuoy, ImageUp, Video, Mic, Paperclip } from "lucide-react";

const DEFAULT_AI_INPUT_COST_PER_1M = "0.30";
const DEFAULT_AI_OUTPUT_COST_PER_1M = "2.50";

type Flag = { key: string; enabled: number | boolean; rollout_percentage?: number };
type SettingRow = { key: string; value: string };

function getSettingValue(settings: SettingRow[], key: string, fallback = "") {
  const row = settings.find((s) => s.key === key);
  const v: any = (row as any)?.value;
  return typeof v === "string" ? v : (v ?? fallback);
}

type Stats = {
  totals: {
    users: number;
    active_sessions: number;
    pro_active: number;
    family_active: number;
    deleted_users: number;
    inactive_users: number;
    family_members_active: number;
    profiles_with_measurements: number;
    profiles_with_glucose: number;
    profiles_with_wearable: number;
    profiles_with_progress_photos: number;
    profiles_with_family_members: number;
  };
  today: {
    day: string;
    ai_calls: number;
    ai_event_calls?: number;
    ai_event_errors?: number;
    ai_event_avg_latency_ms?: number;
    ai_calls_events?: number;
    ai_errors_events?: number;
    ai_avg_latency_ms?: number;
    meals_logged: number;
  };
};


type AiCost = {
  today: {
    day_start_ms: number;
    calls: number;
    errors: number;
    tokens: number;
    cost_usd: number;
    fallback_calls: number;
    fallback_pct: number;
    avg_latency_ms: number;
  };
  last_7d: {
    from_ms: number;
    calls: number;
    tokens: number;
    cost_usd: number;
    fallback_calls: number;
    fallback_pct: number;
  };
  top_users_7d: {
    user_id: string;
    email?: string;
    user_created_at?: number;
    plan?: string;
    subscription_status?: string;
    cost_usd: number;
    tokens: number;
    calls: number;
  }[];
};

type UserRow = {
  id: string;
  email?: string;
  name?: string;
  picture?: string;
  created_at?: number;
  deleted_at?: string | null;
  deletion_scheduled_at?: string | null;
  is_active?: number;
  subscription_plan?: string;
  subscription_status?: string;
  profile_version?: number | null;
  profile_updated_at?: number | null;
  has_profile?: boolean;
  has_measurements?: boolean;
  measurements_count?: number;
  progress_photos_count?: number;
  family_members_count?: number;
  blood_glucose_mmol_l?: number | null;
  blood_glucose_measured_at?: string | null;
  weight?: number | null;
  target_weight?: number | null;
  height?: number | null;
  age?: number | null;
  goal?: string;
  medical_restrictions?: string;
  family_exclusions?: string;
  blood_pressure_systolic?: number | null;
  blood_pressure_diastolic?: number | null;
  blood_pressure_measured_at?: string | null;
  waist_cm?: number | null;
  chest_cm?: number | null;
  hips_cm?: number | null;
  body_measurements_measured_at?: string | null;
  resting_pulse?: number | null;
  resting_pulse_measured_at?: string | null;
  wearable_enabled?: boolean;
  wearable_provider?: string;
  wearable_connected_at?: string | null;
  wearable_last_sync_at?: string | null;
  wearable_metrics_updated_at?: string | null;
  wearable_steps_today?: number | null;
  wearable_active_minutes_today?: number | null;
  wearable_sleep_hours_last_night?: number | null;
  wearable_has_data?: boolean;
  glucose_has_data?: boolean;
};

type AiLog = { id: string; user_id: string; ts: number; feature: string; status: number; latency_ms: number; safe_mode: number; error?: string | null };

type SessionRow = {
  id: string;
  created_at: number;
  expires_at: number;
  revoked: number;
  user_agent?: string;
  ip?: string;
  ttl_seconds?: number;
  remaining_seconds?: number;
};

type InviteRow = {
  code: string;
  created_at: number;
  created_by?: string | null;
  note?: string | null;
  max_uses: number;
  uses: number;
  expires_at?: number | null;
  revoked: number;
  redemption_count?: number;
  last_redeemed_at?: number | null;
};

type SupportAttachment = {
  name: string;
  mime: string;
  size: number;
  kind: "photo" | "video" | "voice" | "file";
  data_url: string;
};

type SupportTicketRow = {
  id: string;
  user_id: string;
  user_email?: string;
  user_name?: string;
  created_at: number;
  updated_at: number;
  category: string;
  section?: string | null;
  subject?: string | null;
  message: string;
  steps_json?: string | null;
  device?: string | null;
  browser?: string | null;
  contact?: string | null;
  app_version?: string | null;
  status: string;
  priority: string;
  attachment_count: number;
  assigned_admin_user_id?: string | null;
  resolved_at?: number | null;
  closed_at?: number | null;
  last_reply_at?: number | null;
  last_reply_by?: string | null;
  attachments?: SupportAttachment[];
  messages?: SupportMessageRow[];
  admin_note?: string | null;
};

type SupportMessageRow = {
  id: string;
  ticket_id: string;
  author_user_id: string;
  author_role: "user" | "admin";
  message: string;
  attachment_count: number;
  created_at: number;
  attachments?: SupportAttachment[];
};

type UserDetail = {
  user: {
    id: string;
    email?: string;
    name?: string;
    picture?: string;
    created_at?: number;
    updated_at?: number;
    deleted_at?: string | null;
    deletion_scheduled_at?: string | null;
    is_active?: number;
  };
  profile: {
    version?: number | null;
    updated_at?: number | null;
    name?: string;
    weight?: number | null;
    height?: number | null;
    age?: number | null;
    target_weight?: number | null;
    goal?: string;
    activity_level?: number | null;
    medical_restrictions?: string;
    family_exclusions?: string;
    blood_pressure_systolic?: number | null;
    blood_pressure_diastolic?: number | null;
    blood_pressure_measured_at?: string | null;
    waist_cm?: number | null;
    chest_cm?: number | null;
    hips_cm?: number | null;
    body_measurements_measured_at?: string | null;
    blood_glucose_mmol_l?: number | null;
    blood_glucose_measured_at?: string | null;
    resting_pulse?: number | null;
    resting_pulse_measured_at?: string | null;
    wearable_provider?: string;
    wearable_enabled?: boolean;
    wearable_connected_at?: string | null;
    wearable_last_sync_at?: string | null;
    wearable_metrics_updated_at?: string | null;
    wearable_steps_today?: number | null;
    wearable_active_minutes_today?: number | null;
    wearable_sleep_hours_last_night?: number | null;
    measurements_count?: number;
    progress_photos_count?: number;
    family_members_count?: number;
    has_measurements?: boolean;
    has_glucose?: boolean;
    weight_history_count?: number;
  };
  roles: string[];
  family: null | {
    family_id: string;
    family_name: string;
    owner_user_id: string;
    member_role: string;
    member_status: string;
    family_created_at?: number | null;
    member_created_at?: number | null;
    member_updated_at?: number | null;
    active_members: number;
  };
  subscription: null | {
    plan?: string;
    status?: string;
    current_period_end?: number | null;
    updated_at?: number | null;
    stripe_customer_id?: string | null;
    stripe_subscription_id?: string | null;
  };
  sessions: (SessionRow & { ttl_seconds: number; remaining_seconds: number })[];
  summary: {
    total_sessions: number;
    active_sessions: number;
    revoked_sessions: number;
    expired_sessions: number;
    session_ttl_seconds: number;
    session_ttl_days: number;
    ai_calls_7d: number;
    ai_tokens_7d: number;
    ai_cost_7d: number;
    ai_errors_7d: number;
    ai_fallback_7d: number;
    last_ai_ts: number | null;
  };
};

type SubscriptionPlan = "free" | "pro" | "family";

function asBool(v: any) { return v === true || v === 1 || v === "1"; }

function toMs(value: unknown): number | null {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n > 1e12 ? n : n * 1000;
}

function formatTimestamp(value: unknown) {
  const ms = toMs(value);
  if (!ms) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ms));
}

function formatDuration(seconds: number) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  if (s === 0) return "0 мин";
  const days = Math.floor(s / 86400);
  const hours = Math.floor((s % 86400) / 3600);
  const mins = Math.max(0, Math.ceil((s % 3600) / 60));
  if (days > 0) return `${days} дн. ${hours} ч`;
  if (hours > 0) return `${hours} ч ${mins} мин`;
  return `${mins} мин`;
}

export default function AdminScreen() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [stats, setStats] = useState<Stats | null>(null);
  const [aiCost, setAiCost] = useState<AiCost | null>(null);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [flagsDirty, setFlagsDirty] = useState<Record<string, { enabled: boolean; rollout: number }>>({});

  const [settings, setSettings] = useState<SettingRow[]>([]);
  const [settingsDirty, setSettingsDirty] = useState<Record<string, string>>({});

  const [userQuery, setUserQuery] = useState("");
  const [userStatusFilter, setUserStatusFilter] = useState("all");
  const [userPlanFilter, setUserPlanFilter] = useState("all");
  const [wearableFilter, setWearableFilter] = useState("all");
  const [glucoseFilter, setGlucoseFilter] = useState("all");
  const [measurementFilter, setMeasurementFilter] = useState("all");
  const [userListLimit, setUserListLimit] = useState(50);
  const [usersTotal, setUsersTotal] = useState(0);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [admins, setAdmins] = useState<UserRow[]>([]);
  const [adminEvents, setAdminEvents] = useState<any[]>([]);
  const [adminEventQ, setAdminEventQ] = useState("");
  const [adminEventAction, setAdminEventAction] = useState("");
  const [adminEventFrom, setAdminEventFrom] = useState<string>("");
  const [adminEventTo, setAdminEventTo] = useState<string>("");
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedUserDetail, setSelectedUserDetail] = useState<UserDetail | null>(null);
  const [subscriptionPlanDraft, setSubscriptionPlanDraft] = useState<SubscriptionPlan>("free");

  const [roles, setRoles] = useState<string[]>([]);
  const [newRole, setNewRole] = useState("pro");

  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [inviteDraftCount, setInviteDraftCount] = useState(10);
  const [inviteDraftNote, setInviteDraftNote] = useState("Тестер");
  const [inviteDraftMaxUses, setInviteDraftMaxUses] = useState(1);
  const [inviteDraftExpiresAt, setInviteDraftExpiresAt] = useState("");
  const [inviteActionMsg, setInviteActionMsg] = useState<string | null>(null);
  const [createdInviteCodes, setCreatedInviteCodes] = useState<string[]>([]);
  const [inviteCreating, setInviteCreating] = useState(false);

  const [supportTickets, setSupportTickets] = useState<SupportTicketRow[]>([]);
  const [supportTicketsLimit, setSupportTicketsLimit] = useState(20);
  const [supportStatusFilter, setSupportStatusFilter] = useState("all");
  const [selectedSupportTicket, setSelectedSupportTicket] = useState<SupportTicketRow | null>(null);
  const [supportTicketStatusDraft, setSupportTicketStatusDraft] = useState("new");
  const [supportTicketPriorityDraft, setSupportTicketPriorityDraft] = useState("normal");
  const [supportTicketAdminNoteDraft, setSupportTicketAdminNoteDraft] = useState("");
  const [supportTicketReplyDraft, setSupportTicketReplyDraft] = useState("");
  const [supportTicketAssignDraft, setSupportTicketAssignDraft] = useState<"" | "me" | "none">("");
  const [supportTicketSaving, setSupportTicketSaving] = useState(false);

  const [aiLogs, setAiLogs] = useState<AiLog[]>([]);
  const [aiLogLimit, setAiLogLimit] = useState(50);
  const [aiLogFeature, setAiLogFeature] = useState<string>("");

  const selectedUserLabel = useMemo(() => {
    const u = users.find((x) => x.id === selectedUserId);
    const c = aiCost?.top_users_7d.find((x) => x.user_id === selectedUserId);
    return selectedUserDetail?.profile?.name || selectedUserDetail?.user?.name || selectedUserDetail?.user?.email || u?.name || u?.email || c?.email || u?.id || selectedUserId;
  }, [aiCost, selectedUserDetail, users, selectedUserId]);

  const loadAiLogs = async () => {
    try {
      const qs = new URLSearchParams();
      qs.set('limit', String(aiLogLimit));
      if (aiLogFeature) qs.set('feature', aiLogFeature);
      const r = await fetch(`/api/admin/ai_logs?${qs.toString()}`, { credentials: 'include' });
      if (r.ok) {
        const j = await r.json();
        setAiLogs(Array.isArray(j.logs) ? j.logs : []);
      }
    } catch {}
  };

  const loadAdminEvents = async () => {
    try {
      const qs = new URLSearchParams();
      qs.set('limit', '100');
      if (adminEventQ.trim()) qs.set('q', adminEventQ.trim());
      if (adminEventAction.trim()) qs.set('action', adminEventAction.trim());
      if (adminEventFrom) qs.set('from', adminEventFrom);
      if (adminEventTo) qs.set('to', adminEventTo);
      const r = await fetch(`/api/admin/admin_events?${qs.toString()}`, { credentials: 'include' });
      if (r.ok) {
        const j = await r.json();
        setAdminEvents(Array.isArray(j.events) ? j.events : []);
      }
    } catch {}
  };

  const loadInvites = async () => {
    try {
      const r = await fetch("/api/admin/invites?limit=100", { credentials: "include" });
      if (r.ok) {
        const j = await r.json();
        setInvites(Array.isArray(j?.invites) ? j.invites : []);
      }
    } catch {}
  };

  const parseSupportSteps = (value: unknown) => {
    if (!value) return [] as string[];
    try {
      const parsed = JSON.parse(String(value));
      return Array.isArray(parsed) ? parsed.map((step) => String(step)).filter(Boolean) : [];
    } catch {
      return [];
    }
  };

  const loadSupportTickets = async () => {
    try {
      const limit = Math.max(1, Math.min(100, Number(supportTicketsLimit) || 20));
      const qs = new URLSearchParams();
      qs.set("limit", String(limit));
      if (supportStatusFilter !== "all") qs.set("status", supportStatusFilter);
      const r = await fetch(`/api/support/feedback?${qs.toString()}`, { credentials: "include" });
      if (!r.ok) return;
      const j = await r.json();
      setSupportTickets(Array.isArray(j?.tickets) ? j.tickets : []);
    } catch {}
  };

  const loadSupportTicketDetail = async (ticketId: string) => {
    if (!ticketId) return;
    try {
      const r = await fetch(`/api/support/feedback?id=${encodeURIComponent(ticketId)}`, { credentials: "include" });
      if (!r.ok) return;
      const j = await r.json();
      setSelectedSupportTicket(j?.ticket ? j.ticket : null);
    } catch {}
  };

  useEffect(() => {
    if (!selectedSupportTicket) return;
    setSupportTicketStatusDraft(selectedSupportTicket.status || "new");
    setSupportTicketPriorityDraft(selectedSupportTicket.priority || "normal");
    setSupportTicketAdminNoteDraft(selectedSupportTicket.admin_note || "");
    setSupportTicketReplyDraft("");
    setSupportTicketAssignDraft("");
  }, [selectedSupportTicket]);

  const saveSupportTicket = async () => {
    if (!selectedSupportTicket?.id) return;
    setSupportTicketSaving(true);
    setErr(null);
    try {
      const r = await fetch("/api/support/feedback", {
        method: "PATCH",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: selectedSupportTicket.id,
          status: supportTicketStatusDraft,
          priority: supportTicketPriorityDraft,
          admin_note: supportTicketAdminNoteDraft,
          message: supportTicketReplyDraft,
          assign_to: supportTicketAssignDraft || undefined,
        }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.message || j?.error || "Не удалось обновить обращение");
      setSelectedSupportTicket(j?.ticket || null);
      setSupportTicketReplyDraft("");
      setSupportTicketAssignDraft("");
      await loadSupportTickets();
    } catch (e: any) {
      setErr(e?.message || "Не удалось обновить обращение");
    } finally {
      setSupportTicketSaving(false);
    }
  };

  const exportAdminEventsCsv = () => {
    const qs = new URLSearchParams();
    qs.set('limit', '500');
    qs.set('format', 'csv');
    if (adminEventQ.trim()) qs.set('q', adminEventQ.trim());
    if (adminEventAction.trim()) qs.set('action', adminEventAction.trim());
    if (adminEventFrom) qs.set('from', adminEventFrom);
    if (adminEventTo) qs.set('to', adminEventTo);
    window.open(`/api/admin/admin_events?${qs.toString()}`, '_blank');
  };


  const loadAll = async () => {
    setLoading(true); setErr(null);
    try {
      const [s, f, a, c, st, i] = await Promise.all([
        fetch("/api/admin/stats", { credentials: "include" }),
        fetch("/api/admin/feature_flags", { credentials: "include" }),
        fetch("/api/admin/admins", { credentials: "include" }),
        fetch("/api/admin/ai-cost", { credentials: "include" }),
        fetch("/api/admin/settings", { credentials: "include" }),
        fetch("/api/admin/invites?limit=100", { credentials: "include" }),
      ]);
      if (!s.ok) throw new Error("Нет доступа к /api/admin/stats (нужна роль admin)");
      if (!a.ok) throw new Error("Нет доступа к /api/admin/admins (нужна роль admin)");
      if (!f.ok) throw new Error("Нет доступа к /api/admin/feature_flags (нужна роль admin)");
      if (!c.ok) throw new Error("Нет доступа к /api/admin/ai-cost (нужна роль admin)");
      if (!st.ok) throw new Error("Нет доступа к /api/admin/settings (нужна роль admin)");
      if (!i.ok) throw new Error("Нет доступа к /api/admin/invites (нужна роль admin)");
      const sj = await s.json();
      const fj = await f.json();
      const aj = await a.json();
      const cj = await c.json();
      const stj = await st.json();
      const ij = await i.json();
      setStats(sj?.stats || null);
      setAiCost(cj || null);
      setFlags(Array.isArray(fj?.flags) ? fj.flags : []);
      setAdmins(Array.isArray(aj?.admins) ? aj.admins : []);
      setSettings(Array.isArray(stj?.settings) ? stj.settings : []);
      setInvites(Array.isArray(ij?.invites) ? ij.invites : []);
      setSettingsDirty({});
      setInviteActionMsg(null);
      setCreatedInviteCodes([]);
      await loadUsers({ silent: true });
      await loadSupportTickets();
      await loadAdminEvents();
      setFlagsDirty({});
    } catch (e: any) {
      setErr(e?.message || "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadAll(); }, []);

  const loadUsers = async (options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent);
    if (!silent) {
      setLoading(true);
    }
    setErr(null);
    try {
      const qs = new URLSearchParams();
      if (userQuery.trim()) qs.set("query", userQuery.trim());
      qs.set("status", userStatusFilter);
      qs.set("plan", userPlanFilter);
      qs.set("wearable", wearableFilter);
      qs.set("glucose", glucoseFilter);
      qs.set("measurements", measurementFilter);
      qs.set("limit", String(userListLimit));
      const r = await fetch(`/api/admin/users?${qs.toString()}`, { credentials: "include" });
      if (!r.ok) throw new Error("Список пользователей недоступен (нужна роль admin)");
      const j = await r.json();
      setUsers(Array.isArray(j?.users) ? j.users : []);
      setUsersTotal(Number(j?.total || 0));
    } catch (e: any) {
      setErr(e?.message || "Ошибка загрузки пользователей");
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  };

  const loadUserDetails = async (userId: string) => {
    if (!userId) return;
    setLoading(true); setErr(null);
    setSelectedUserDetail(null);
    setRoles([]);
    setSessions([]);
    try {
      const rr = await fetch(`/api/admin/user_detail?user_id=${encodeURIComponent(userId)}`, { credentials: "include" });
      if (!rr.ok) throw new Error("Нет доступа к карточке пользователя");
      const rj = await rr.json();
      setSelectedUserDetail(rj as UserDetail);
      setRoles(Array.isArray(rj?.roles) ? rj.roles : []);
      setSessions(Array.isArray(rj?.sessions) ? rj.sessions : []);
      setSubscriptionPlanDraft((rj?.subscription?.plan === "pro" || rj?.subscription?.plan === "family" ? rj.subscription.plan : "free") as SubscriptionPlan);
    } catch (e: any) {
      setErr(e?.message || "Ошибка загрузки пользователя");
    } finally {
      setLoading(false);
    }
  };

  const saveSubscriptionPlan = async () => {
    if (!selectedUserId) return;
    setLoading(true);
    setErr(null);
    try {
      const r = await fetch("/api/admin/subscription", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: selectedUserId, plan: subscriptionPlanDraft }),
      });
      if (!r.ok) throw new Error("Не удалось сменить тариф");
      await loadUserDetails(selectedUserId);
      await loadAll();
    } catch (e: any) {
      setErr(e?.message || "Ошибка смены тарифа");
    } finally {
      setLoading(false);
    }
  };

  const saveFlag = async (key: string) => {
    const d = flagsDirty[key];
    if (!d) return;
    setLoading(true); setErr(null);
    try {
      const r = await fetch("/api/admin/feature_flags", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, enabled: d.enabled, rollout_percentage: d.rollout }),
      });
      if (!r.ok) throw new Error("Не удалось сохранить флаг");
      await loadAll();
    } catch (e: any) {
      setErr(e?.message || "Ошибка сохранения");
    } finally {
      setLoading(false);
    }
  };

  const saveFlags = async () => {
    const keys = Object.keys(flagsDirty);
    for (const key of keys) {
      await saveFlag(key);
    }
  };

  const saveSetting = async (key: string) => {
    const value = settingsDirty[key];
    if (typeof value !== "string") return;
    setLoading(true); setErr(null);
    try {
      const r = await fetch("/api/admin/settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });
      if (!r.ok) throw new Error("Не удалось сохранить настройку");
      await loadAll();
    } catch (e: any) {
      setErr(e?.message || "Ошибка сохранения");
    } finally {
      setLoading(false);
    }
  };


  const toggleFlag = (flag: Flag) => {
    const key = flag.key;
    const currentEnabled = flagsDirty[key]?.enabled ?? asBool(flag.enabled);
    const currentRoll = flagsDirty[key]?.rollout ?? Number(flag.rollout_percentage ?? 100);
    setFlagsDirty(prev => ({ ...prev, [key]: { enabled: !currentEnabled, rollout: currentRoll } }));
  };

  const setRollout = (flag: Flag, rollout: number) => {
    const key = flag.key;
    const currentEnabled = flagsDirty[key]?.enabled ?? asBool(flag.enabled);
    setFlagsDirty(prev => ({ ...prev, [key]: { enabled: currentEnabled, rollout } }));
  };

  const mutateRole = async (action: "add" | "remove", role: string) => {
    if (!selectedUserId) return;
    setLoading(true); setErr(null);
    try {
      const r = await fetch("/api/admin/user_roles", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: selectedUserId, role, action }),
      });
      if (!r.ok) throw new Error("Не удалось изменить роль");
      await loadUserDetails(selectedUserId);
    } catch (e: any) {
      setErr(e?.message || "Ошибка роли");
    } finally {
      setLoading(false);
    }
  };

  const revokeSession = async (sessionId: string) => {
    if (!selectedUserId) return;
    setLoading(true); setErr(null);
    try {
      const r = await fetch("/api/admin/sessions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: selectedUserId, session_id: sessionId, action: "revoke" }),
      });
      if (!r.ok) throw new Error("Не удалось отозвать сессию");
      await loadUserDetails(selectedUserId);
    } catch (e: any) {
      setErr(e?.message || "Ошибка сессии");
    } finally {
      setLoading(false);
    }
  };

  const logoutAll = async () => {
    setLoading(true); setErr(null);
    try {
      const r = await fetch("/api/logout_all", { method: "POST", credentials: "include" });
      if (!r.ok) throw new Error("Не удалось выйти со всех устройств");
      await loadAll();
    } catch (e: any) {
      setErr(e?.message || "Ошибка logout_all");
    } finally {
      setLoading(false);
    }
  };

  const createInvitesBatch = async () => {
    const count = Math.max(1, Math.min(50, Math.floor(Number(inviteDraftCount) || 1)));
    const maxUses = Math.max(1, Math.min(1000, Math.floor(Number(inviteDraftMaxUses) || 1)));
    const note = inviteDraftNote.trim();
    const expiresAt = inviteDraftExpiresAt ? new Date(inviteDraftExpiresAt).getTime() : null;
    setLoading(true);
    setInviteCreating(true);
    setErr(null);
    setInviteActionMsg(null);
    setCreatedInviteCodes([]);
    try {
      const r = await fetch("/api/admin/invites", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          count,
          note: note || "Тестер",
          max_uses: maxUses,
          expires_at: Number.isFinite(expiresAt as number) ? expiresAt : null,
        }),
      });
      const j = await r.json().catch(() => null);
      const codes = Array.isArray(j?.codes) ? j.codes.map((code: unknown) => String(code)).filter(Boolean) : [];
      if (!r.ok || !codes.length) {
        throw new Error(j?.error?.code || j?.error?.message || "Не удалось создать invite");
      }
      setCreatedInviteCodes(codes);
      setInviteActionMsg(`Создано ${codes.length} invite-кодов для тестировщиков.`);
      await loadInvites();
    } catch (e: any) {
      setErr(e?.message || "Ошибка создания invite-кодов");
    } finally {
      setLoading(false);
      setInviteCreating(false);
    }
  };

  const revokeInvite = async (code: string, revoked: boolean) => {
    setLoading(true);
    setErr(null);
    setInviteActionMsg(null);
    try {
      const r = await fetch("/api/admin/invites", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, revoked }),
      });
      if (!r.ok) throw new Error("Не удалось изменить статус invite");
      setInviteActionMsg(`${revoked ? "Отозван" : "Восстановлен"} код ${code}.`);
      await loadInvites();
    } catch (e: any) {
      setErr(e?.message || "Ошибка invite-кода");
    } finally {
      setLoading(false);
    }
  };

  const copyInviteCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setInviteActionMsg(`Код ${code} скопирован.`);
    } catch {
      setErr("Не удалось скопировать invite-код");
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-black text-slate-100 flex items-center gap-3">
            <ShieldCheck className="text-indigo-400" />
            Admin Console
          </h1>
          <p className="text-slate-400 font-medium mt-1">
            Управление продуктом без деплоя: фичи, роли, сессии, метрики.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={loadAll} className="px-4 py-2 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold flex items-center gap-2">
            <RefreshCcw size={18} /> Обновить
          </button>
          <button onClick={logoutAll} className="px-4 py-2 rounded-2xl bg-rose-500/10 hover:bg-rose-500/20 text-rose-200 font-bold flex items-center gap-2">
            <KeyRound size={18} /> Выйти со всех устройств
          </button>
        </div>
      </div>

      {err && (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-rose-200 font-semibold">
          {err}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="rounded-3xl p-5 bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between">
            <div className="text-slate-400 font-bold">Пользователи</div>
            <Users className="text-slate-500" />
          </div>
          <div className="text-3xl font-black text-slate-100 mt-2">{stats?.totals?.users ?? "—"}</div>
        </div>
        <div className="rounded-3xl p-5 bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between">
            <div className="text-slate-400 font-bold">Активные сессии</div>
            <Activity className="text-slate-500" />
          </div>
          <div className="text-3xl font-black text-slate-100 mt-2">{stats?.totals?.active_sessions ?? "—"}</div>
        </div>
        <div className="rounded-3xl p-5 bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between">
            <div className="text-slate-400 font-bold">PRO активных</div>
            <div className="text-amber-400 font-black">PRO</div>
          </div>
          <div className="text-3xl font-black text-slate-100 mt-2">{stats?.totals?.pro_active ?? "—"}</div>
        </div>
        <div className="rounded-3xl p-5 bg-slate-900/60 border border-slate-800">
          <div className="flex items-center justify-between">
            <div className="text-slate-400 font-bold">Сегодня AI</div>
            <div className="text-indigo-400 font-black">{stats?.today?.day ?? ""}</div>
          </div>
          <div className="text-3xl font-black text-slate-100 mt-2">{stats?.today?.ai_calls ?? "—"}</div>
          <div className="text-slate-500 font-semibold mt-1">вызовов</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4">
        <div className="rounded-3xl p-5 bg-slate-900/60 border border-slate-800">
          <div className="text-slate-400 font-bold">Удалённые</div>
          <div className="text-3xl font-black text-slate-100 mt-2">{stats?.totals?.deleted_users ?? "—"}</div>
          <div className="text-slate-500 font-semibold mt-1">в soft-delete</div>
        </div>
        <div className="rounded-3xl p-5 bg-slate-900/60 border border-slate-800">
          <div className="text-slate-400 font-bold">Неактивные</div>
          <div className="text-3xl font-black text-slate-100 mt-2">{stats?.totals?.inactive_users ?? "—"}</div>
          <div className="text-slate-500 font-semibold mt-1">без удаления</div>
        </div>
        <div className="rounded-3xl p-5 bg-slate-900/60 border border-slate-800">
          <div className="text-slate-400 font-bold">Профили с замерами</div>
          <div className="text-3xl font-black text-slate-100 mt-2">{stats?.totals?.profiles_with_measurements ?? "—"}</div>
          <div className="text-slate-500 font-semibold mt-1">вес / давление / пульс</div>
        </div>
        <div className="rounded-3xl p-5 bg-slate-900/60 border border-slate-800">
          <div className="text-slate-400 font-bold">С сахаром</div>
          <div className="text-3xl font-black text-slate-100 mt-2">{stats?.totals?.profiles_with_glucose ?? "—"}</div>
          <div className="text-slate-500 font-semibold mt-1">blood glucose</div>
        </div>
        <div className="rounded-3xl p-5 bg-slate-900/60 border border-slate-800">
          <div className="text-slate-400 font-bold">Wearable</div>
          <div className="text-3xl font-black text-slate-100 mt-2">{stats?.totals?.profiles_with_wearable ?? "—"}</div>
          <div className="text-slate-500 font-semibold mt-1">подключённые устройства</div>
        </div>
        <div className="rounded-3xl p-5 bg-slate-900/60 border border-slate-800">
          <div className="text-slate-400 font-bold">Family-участники</div>
          <div className="text-3xl font-black text-slate-100 mt-2">{stats?.totals?.family_members_active ?? "—"}</div>
          <div className="text-slate-500 font-semibold mt-1">активные связи семьи</div>
        </div>
      </div>

      
      {/* AI Cost Intelligence */}
      <div className="rounded-3xl bg-slate-900/60 border border-slate-800 p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-black text-slate-100">AI Cost Intelligence</h2>
            <div className="text-slate-300 font-semibold mt-1">
              Стоимость и нагрузка AI (токены, расходы, fallback).
            </div>
          </div>
          <button
            onClick={loadAll}
            className="px-4 py-2 rounded-2xl bg-slate-800/70 border border-slate-700 text-slate-100 font-black hover:bg-slate-700/70 inline-flex items-center gap-2"
            title="Обновить"
          >
            <RefreshCcw className="w-4 h-4" />
            Обновить
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
          <div className="rounded-3xl p-5 bg-slate-950/40 border border-slate-800">
            <div className="text-slate-400 font-bold">Сегодня — расходы</div>
            <div className="text-3xl font-black text-slate-100 mt-2">
              {aiCost ? `$${(aiCost.today.cost_usd || 0).toFixed(4)}` : "—"}
            </div>
            <div className="text-slate-400 font-semibold mt-2">
              {aiCost ? `${aiCost.today.calls} вызовов · ${aiCost.today.tokens} токенов` : ""}
            </div>
          </div>

          <div className="rounded-3xl p-5 bg-slate-950/40 border border-slate-800">
            <div className="text-slate-400 font-bold">7 дней — расходы</div>
            <div className="text-3xl font-black text-slate-100 mt-2">
              {aiCost ? `$${(aiCost.last_7d.cost_usd || 0).toFixed(4)}` : "—"}
            </div>
            <div className="text-slate-400 font-semibold mt-2">
              {aiCost ? `${aiCost.last_7d.calls} вызовов · ${aiCost.last_7d.tokens} токенов` : ""}
            </div>
          </div>

          <div className="rounded-3xl p-5 bg-slate-950/40 border border-slate-800">
            <div className="text-slate-400 font-bold">Fallback</div>
            <div className="text-3xl font-black text-slate-100 mt-2">
              {aiCost ? `${aiCost.today.fallback_pct}%` : "—"}
            </div>
            <div className="text-slate-400 font-semibold mt-2">
              {aiCost ? `${aiCost.today.fallback_calls} fallback сегодня` : ""}
            </div>
          </div>

          <div className="rounded-3xl p-5 bg-slate-950/40 border border-slate-800">
            <div className="text-slate-400 font-bold">Latency avg</div>
            <div className="text-3xl font-black text-slate-100 mt-2">
              {aiCost ? `${aiCost.today.avg_latency_ms} мс` : "—"}
            </div>
            <div className="text-slate-400 font-semibold mt-2">
              {aiCost ? `${aiCost.today.errors} ошибок сегодня` : ""}
            </div>
          </div>
        </div>

        <div className="mt-6">
          <div className="text-slate-200 font-black mb-1">Top 10 пользователей по стоимости (7 дней)</div>
          <div className="text-slate-500 font-semibold text-sm mb-2">Кликните по строке, чтобы открыть карточку пользователя, план, роли и срок жизни сессий.</div>
          <div className="overflow-auto rounded-2xl border border-slate-800">
            <table className="min-w-[860px] w-full text-sm">
              <thead className="bg-slate-900/70">
                <tr className="text-slate-300">
                  <th className="text-left p-3 font-black">пользователь</th>
                  <th className="text-left p-3 font-black">план</th>
                  <th className="text-left p-3 font-black">cost</th>
                  <th className="text-left p-3 font-black">tokens</th>
                  <th className="text-left p-3 font-black">calls</th>
                </tr>
              </thead>
              <tbody>
                {(aiCost?.top_users_7d || []).map((r) => (
                  <tr
                    key={r.user_id}
                    onClick={() => { setSelectedUserId(r.user_id); void loadUserDetails(r.user_id); }}
                    className={`border-t border-slate-800 text-slate-200 transition cursor-pointer hover:bg-slate-900/50 ${selectedUserId === r.user_id ? "bg-indigo-500/10" : ""}`}
                    title="Открыть карточку пользователя"
                  >
                    <td className="p-3">
                      <div className="flex items-center gap-2 font-black text-slate-100">
                        <span>{r.email || r.user_id}</span>
                        <ChevronRight size={14} className="text-slate-500" />
                      </div>
                      <div className="font-mono text-[11px] text-slate-500">{r.user_id}</div>
                    </td>
                    <td className="p-3">
                      <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 px-3 py-1 text-xs font-black text-indigo-100">
                        {r.plan || "free"}
                      </div>
                      <div className="mt-1 text-[11px] text-slate-500">{r.subscription_status || "inactive"}</div>
                    </td>
                    <td className="p-3 font-black">{`$${(r.cost_usd || 0).toFixed(4)}`}</td>
                    <td className="p-3 font-bold">{r.tokens}</td>
                    <td className="p-3 font-bold">{r.calls}</td>
                  </tr>
                ))}
                {(!aiCost?.top_users_7d || aiCost.top_users_7d.length === 0) && (
                  <tr className="border-t border-slate-800">
                    <td className="p-3 text-slate-400 font-semibold" colSpan={5}>Пока нет данных.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>


      {/* AI Budget Guard */}
      <div className="rounded-3xl bg-slate-900/60 border border-slate-800 p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-black text-slate-100">AI Budget Guard</h2>
            <div className="text-slate-300 font-semibold mt-1">
              Лимиты и аварийные переключатели (без деплоя). По умолчанию — fallback.
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
          <div className="rounded-3xl p-5 bg-slate-950/40 border border-slate-800">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-slate-200 font-black">Budget Guard</div>
                <div className="text-slate-400 font-semibold text-sm">Включить/выключить проверку лимитов</div>
              </div>
              {(() => {
                const f = flags.find(x => x.key === "ai_budget_guard_enabled");
                const enabled = (flagsDirty["ai_budget_guard_enabled"]?.enabled ?? (Number((f as any)?.enabled || 0) === 1));
                return (
                  <button
                    onClick={() => {
                      const currRollout = flagsDirty["ai_budget_guard_enabled"]?.rollout ?? Number((f as any)?.rollout_percentage ?? 100);
                      setFlagsDirty(d => ({ ...d, ai_budget_guard_enabled: { enabled: !enabled, rollout: currRollout } }));
                    }}
                    className={`px-4 py-2 rounded-2xl font-black ${enabled ? "bg-emerald-500/15 text-emerald-200 border border-emerald-500/30" : "bg-slate-800/70 text-slate-200 border border-slate-700"}`}
                    title="Переключить"
                  >
                    {enabled ? "ON" : "OFF"}
                  </button>
                );
              })()}
            </div>
            <div className="mt-3">
              <button
                onClick={() => saveFlag("ai_budget_guard_enabled")}
                className="px-4 py-2 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-100 font-black hover:bg-indigo-500/20"
              >
                Сохранить
              </button>
            </div>
          </div>

          <div className="rounded-3xl p-5 bg-slate-950/40 border border-slate-800">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-slate-200 font-black">Emergency fallback</div>
                <div className="text-slate-400 font-semibold text-sm">Принудительно переводит AI в fallback</div>
              </div>
              {(() => {
                const f = flags.find(x => x.key === "ai_emergency_fallback");
                const enabled = (flagsDirty["ai_emergency_fallback"]?.enabled ?? (Number((f as any)?.enabled || 0) === 1));
                return (
                  <button
                    onClick={() => {
                      const currRollout = flagsDirty["ai_emergency_fallback"]?.rollout ?? Number((f as any)?.rollout_percentage ?? 100);
                      setFlagsDirty(d => ({ ...d, ai_emergency_fallback: { enabled: !enabled, rollout: currRollout } }));
                    }}
                    className={`px-4 py-2 rounded-2xl font-black ${enabled ? "bg-rose-500/15 text-rose-200 border border-rose-500/30" : "bg-slate-800/70 text-slate-200 border border-slate-700"}`}
                    title="Переключить"
                  >
                    {enabled ? "ON" : "OFF"}
                  </button>
                );
              })()}
            </div>
            <div className="mt-3">
              <button
                onClick={() => saveFlag("ai_emergency_fallback")}
                className="px-4 py-2 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-100 font-black hover:bg-indigo-500/20"
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
          {[
            { key: "ai_cost_input_per_1m_usd", label: "Input price / 1M tokens ($)", hint: "Gemini 2.5 Flash Standard", defaultValue: DEFAULT_AI_INPUT_COST_PER_1M },
            { key: "ai_cost_output_per_1m_usd", label: "Output price / 1M tokens ($)", hint: "Gemini 2.5 Flash Standard", defaultValue: DEFAULT_AI_OUTPUT_COST_PER_1M },
            { key: "ai_max_calls_per_user_day", label: "Calls / user / day", hint: "0 = без лимита" },
            { key: "ai_max_cost_per_user_day_usd", label: "Cost / user / day ($)", hint: "0 = без лимита" },
            { key: "ai_max_cost_total_day_usd", label: "Total cost / day ($)", hint: "0 = без лимита" },
            { key: "ai_on_limit_action", label: "On limit action", hint: "fallback или block" },
          ].map((s) => {
            const current = settingsDirty[s.key] ?? getSettingValue(settings, s.key, (s as any).defaultValue ?? "");
            return (
              <div key={s.key} className="rounded-3xl p-5 bg-slate-950/40 border border-slate-800">
                <div className="text-slate-200 font-black">{s.label}</div>
                <div className="text-slate-400 font-semibold text-sm mt-1">{s.hint}</div>
                <input
                  className="mt-3 w-full px-4 py-2 rounded-2xl bg-slate-900/60 border border-slate-700 text-slate-100 font-bold"
                  value={current}
                  onChange={(e) => setSettingsDirty((d) => ({ ...d, [s.key]: e.target.value }))}
                  placeholder="0"
                />
                <button
                  onClick={() => saveSetting(s.key)}
                  className="mt-3 px-4 py-2 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-100 font-black hover:bg-indigo-500/20"
                >
                  Сохранить
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Invite testers */}
      <div className="rounded-3xl bg-slate-900/60 border border-slate-800 p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-black text-slate-100">Тестировщики / нагрузочные invite-коды</h2>
            <div className="text-slate-300 font-semibold mt-1">
              Сгенерируйте пачку кодов для закрытой beta и нагрузочного теста. Каждый Google-аккаунт = отдельный cloud-профиль, тарифы не ограничиваем.
            </div>
          </div>
          <button
            onClick={loadInvites}
            className="px-4 py-2 rounded-2xl bg-slate-800/70 border border-slate-700 text-slate-100 font-black hover:bg-slate-700/70 inline-flex items-center gap-2"
          >
            <RefreshCcw className="w-4 h-4" />
            Обновить
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
          <label className="rounded-3xl p-5 bg-slate-950/40 border border-slate-800 block">
            <div className="text-slate-200 font-black">Кодов для генерации</div>
            <div className="text-slate-400 font-semibold text-sm mt-1">Например, 10 тестировщиков = 10 кодов для одновременной проверки нагрузки</div>
            <input
              type="number"
              min={1}
              max={50}
              value={inviteDraftCount}
              onChange={(e) => setInviteDraftCount(Number(e.target.value))}
              className="mt-3 w-full px-4 py-2 rounded-2xl bg-slate-900/60 border border-slate-700 text-slate-100 font-bold"
            />
          </label>

          <label className="rounded-3xl p-5 bg-slate-950/40 border border-slate-800 block">
            <div className="text-slate-200 font-black">Подпись / tester note</div>
            <div className="text-slate-400 font-semibold text-sm mt-1">Можно писать имя, email или роль тестировщика</div>
            <input
              value={inviteDraftNote}
              onChange={(e) => setInviteDraftNote(e.target.value)}
              className="mt-3 w-full px-4 py-2 rounded-2xl bg-slate-900/60 border border-slate-700 text-slate-100 font-bold"
              placeholder="Тестировщик 1"
            />
          </label>

          <label className="rounded-3xl p-5 bg-slate-950/40 border border-slate-800 block">
            <div className="text-slate-200 font-black">Макс. использований</div>
            <div className="text-slate-400 font-semibold text-sm mt-1">Для личного теста обычно 1</div>
            <input
              type="number"
              min={1}
              max={1000}
              value={inviteDraftMaxUses}
              onChange={(e) => setInviteDraftMaxUses(Number(e.target.value))}
              className="mt-3 w-full px-4 py-2 rounded-2xl bg-slate-900/60 border border-slate-700 text-slate-100 font-bold"
            />
          </label>

          <label className="rounded-3xl p-5 bg-slate-950/40 border border-slate-800 block">
            <div className="text-slate-200 font-black">Срок действия</div>
            <div className="text-slate-400 font-semibold text-sm mt-1">Необязательно. Максимум 30 дней.</div>
            <input
              type="datetime-local"
              value={inviteDraftExpiresAt}
              onChange={(e) => setInviteDraftExpiresAt(e.target.value)}
              className="mt-3 w-full px-4 py-2 rounded-2xl bg-slate-900/60 border border-slate-700 text-slate-100 font-bold"
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={createInvitesBatch}
            disabled={inviteCreating}
            className="px-4 py-2 rounded-2xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-100 font-black hover:bg-indigo-500/20 inline-flex items-center gap-2"
          >
            <KeyRound className="w-4 h-4" />
            {inviteCreating ? "Создаём…" : "Создать коды"}
          </button>
          <div className="text-slate-400 font-semibold self-center">
            Выдайте каждому тестировщику отдельный код и попросите входить только через Google.
          </div>
        </div>

        {inviteActionMsg && (
          <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-emerald-100 font-semibold">
            {inviteActionMsg}
          </div>
        )}

        {createdInviteCodes.length > 0 && (
          <div className="mt-4 rounded-2xl border border-slate-800 bg-slate-950/40 p-4">
            <div className="text-slate-200 font-black mb-2">Созданные коды</div>
            <div className="flex flex-wrap gap-2">
              {createdInviteCodes.map((code) => (
                <button
                  key={code}
                  onClick={() => void copyInviteCode(code)}
                  className="px-3 py-2 rounded-full bg-slate-800 text-slate-100 font-mono text-sm border border-slate-700 hover:bg-slate-700"
                  title="Копировать код"
                >
                  {code}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 overflow-auto rounded-2xl border border-slate-800">
          <table className="min-w-[920px] w-full text-sm">
            <thead className="bg-slate-900/70">
              <tr className="text-slate-300">
                <th className="text-left p-3 font-black">code</th>
                <th className="text-left p-3 font-black">note</th>
                <th className="text-left p-3 font-black">uses</th>
                <th className="text-left p-3 font-black">expires</th>
                <th className="text-left p-3 font-black">status</th>
                <th className="text-left p-3 font-black">actions</th>
              </tr>
            </thead>
            <tbody>
              {invites.map((invite) => {
                const fullUses = `${invite.uses}/${invite.max_uses}`;
                const expired = !!invite.expires_at && toMs(invite.expires_at) !== null && (toMs(invite.expires_at) || 0) < Date.now();
                const isRevoked = Number(invite.revoked) === 1;
                const redemptionCount = Math.max(0, Math.floor(Number(invite.redemption_count) || 0));
                const isUsed = redemptionCount > 0;
                const isConsumed = Number(invite.uses) >= Number(invite.max_uses);
                return (
                  <tr
                    key={invite.code}
                    className={`border-t border-slate-800 text-slate-200 ${isUsed && !isRevoked && !expired ? 'bg-amber-500/5' : ''} ${isConsumed ? 'opacity-80' : ''}`}
                  >
                    <td className={`p-3 font-mono font-bold ${isConsumed ? 'line-through decoration-amber-400/80' : ''} ${isUsed && !isConsumed ? 'text-amber-100' : ''}`}>
                      {invite.code}
                    </td>
                    <td className="p-3">
                      <div className="font-black text-slate-100">{invite.note || '—'}</div>
                      <div className="text-[11px] text-slate-500 font-mono">by {invite.created_by || '—'}</div>
                      {isUsed && (
                        <div className="mt-1 text-[11px] font-black text-amber-200">
                          Использован клиентом {redemptionCount} раз{invite.last_redeemed_at ? ` • ${formatTimestamp(invite.last_redeemed_at)}` : ''}
                        </div>
                      )}
                    </td>
                    <td className="p-3 font-bold">{fullUses}</td>
                    <td className="p-3 font-semibold text-slate-400">{formatTimestamp(invite.expires_at)}</td>
                    <td className="p-3">
                      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-black border ${isRevoked ? 'border-rose-500/30 bg-rose-500/10 text-rose-100' : expired ? 'border-amber-500/30 bg-amber-500/10 text-amber-100' : isConsumed ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-100' : isUsed ? 'border-amber-500/30 bg-amber-500/10 text-amber-100' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-100'}`}>
                        {isRevoked ? 'revoked' : expired ? 'expired' : isConsumed ? 'consumed' : isUsed ? 'used' : 'active'}
                      </div>
                    </td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => void copyInviteCode(invite.code)}
                          className="px-3 py-2 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-black"
                        >
                          Копировать
                        </button>
                        <button
                          onClick={() => void revokeInvite(invite.code, !isRevoked)}
                          className={`px-3 py-2 rounded-2xl font-black ${isRevoked ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-100 border border-emerald-500/30' : 'bg-rose-500/10 hover:bg-rose-500/20 text-rose-100 border border-rose-500/30'}`}
                        >
                          {isRevoked ? 'Вернуть' : 'Отозвать'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!invites.length && (
                <tr className="border-t border-slate-800">
                  <td className="p-3 text-slate-400 font-semibold" colSpan={6}>Invite-коды пока не созданы.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Support feedback */}
      <div className="rounded-3xl bg-slate-900/60 border border-slate-800 p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-black text-slate-100 flex items-center gap-2">
              <LifeBuoy className="text-cyan-400" />
              Обратная связь
            </h2>
            <div className="text-slate-300 font-semibold mt-1">
              Обращения из формы поддержки с голосом, фото и видео.
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={supportStatusFilter}
              onChange={(e) => setSupportStatusFilter(e.target.value)}
              className="px-3 py-2 rounded-2xl bg-slate-950/40 border border-slate-800 text-slate-100 font-semibold"
            >
              <option value="all">Все статусы</option>
              <option value="new">new</option>
              <option value="in_progress">in_progress</option>
              <option value="waiting_user">waiting_user</option>
              <option value="resolved">resolved</option>
              <option value="closed">closed</option>
            </select>
            <input
              type="number"
              min={1}
              max={100}
              value={supportTicketsLimit}
              onChange={(e) => setSupportTicketsLimit(Math.max(1, Math.min(100, Number(e.target.value || 20))))}
              className="w-24 px-3 py-2 rounded-2xl bg-slate-950/40 border border-slate-800 text-slate-100 font-semibold"
            />
            <button
              onClick={async () => { await loadSupportTickets(); }}
              className="px-4 py-2 rounded-2xl bg-slate-800/70 border border-slate-700 text-slate-100 font-black hover:bg-slate-700/70 inline-flex items-center gap-2"
            >
              <RefreshCcw className="w-4 h-4" />
              Обновить
            </button>
          </div>
        </div>

        <div className="mt-4 overflow-auto rounded-2xl border border-slate-800">
          <table className="min-w-[980px] w-full text-sm">
            <thead className="bg-slate-900/70">
              <tr className="text-slate-300">
                <th className="text-left p-3 font-black">created</th>
                <th className="text-left p-3 font-black">user</th>
                <th className="text-left p-3 font-black">category</th>
                <th className="text-left p-3 font-black">section</th>
                <th className="text-left p-3 font-black">status</th>
                <th className="text-left p-3 font-black">priority</th>
                <th className="text-left p-3 font-black">last reply</th>
                <th className="text-left p-3 font-black">attachments</th>
              </tr>
            </thead>
            <tbody>
              {supportTickets.map((ticket) => {
                const isSelected = selectedSupportTicket?.id === ticket.id;
                return (
                  <tr
                    key={ticket.id}
                    onClick={async () => {
                      setSelectedSupportTicket(ticket);
                      await loadSupportTicketDetail(ticket.id);
                    }}
                    className={`border-t border-slate-800 text-slate-200 transition cursor-pointer hover:bg-slate-900/50 ${isSelected ? "bg-cyan-500/10" : ""}`}
                  >
                    <td className="p-3 font-semibold text-slate-400">{formatTimestamp(ticket.created_at)}</td>
                    <td className="p-3">
                      <div className="font-black text-slate-100">{ticket.user_email || ticket.user_name || ticket.user_id}</div>
                      <div className="font-mono text-[11px] text-slate-500">{ticket.user_id}</div>
                    </td>
                    <td className="p-3">
                      <div className="inline-flex rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-black text-cyan-100">
                        {ticket.category}
                      </div>
                    </td>
                    <td className="p-3 font-semibold text-slate-300">{ticket.section || "—"}</td>
                    <td className="p-3">
                      <div className="inline-flex rounded-full border border-slate-700 bg-slate-900 px-3 py-1 text-xs font-black text-slate-200">
                        {ticket.status}
                      </div>
                    </td>
                    <td className="p-3 font-semibold text-slate-300">{ticket.priority}</td>
                    <td className="p-3 font-semibold text-slate-400">{formatTimestamp(ticket.last_reply_at || ticket.updated_at)}</td>
                    <td className="p-3 font-bold">{ticket.attachment_count}</td>
                  </tr>
                );
              })}
              {!supportTickets.length && (
                <tr className="border-t border-slate-800">
                  <td className="p-3 text-slate-400 font-semibold" colSpan={8}>Пока нет обращений.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {selectedSupportTicket && (
          <div className="mt-4 rounded-3xl bg-slate-950/40 border border-slate-800 p-5 grid grid-cols-1 xl:grid-cols-[1.1fr_0.9fr] gap-5">
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-slate-400 font-bold text-xs uppercase tracking-[0.24em]">Детали обращения</div>
                  <div className="text-2xl font-black text-slate-100 mt-1">{selectedSupportTicket.subject || "Без темы"}</div>
                </div>
                <div className="text-right">
                  <div className="text-slate-400 font-semibold text-sm">{formatTimestamp(selectedSupportTicket.created_at)}</div>
                  <div className="text-slate-500 font-semibold text-sm">{selectedSupportTicket.app_version || "app version —"}</div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                  <div className="text-slate-500 font-black uppercase tracking-[0.24em] text-[11px]">Клиент</div>
                  <div className="mt-1 text-slate-100 font-bold">{selectedSupportTicket.user_email || selectedSupportTicket.user_name || selectedSupportTicket.user_id}</div>
                  <div className="font-mono text-[11px] text-slate-500 break-all">{selectedSupportTicket.user_id}</div>
                  <div className="mt-2 text-slate-400 font-semibold">Контакт: {selectedSupportTicket.contact || "—"}</div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                  <div className="text-slate-500 font-black uppercase tracking-[0.24em] text-[11px]">Устройство</div>
                  <div className="mt-1 text-slate-100 font-bold">{selectedSupportTicket.device || "—"}</div>
                  <div className="text-slate-400 font-semibold">Браузер: {selectedSupportTicket.browser || "—"}</div>
                  <div className="text-slate-400 font-semibold">Раздел: {selectedSupportTicket.section || "—"}</div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="text-slate-500 font-black uppercase tracking-[0.24em] text-[11px]">Описание</div>
                <div className="mt-2 whitespace-pre-wrap leading-7 text-slate-100 font-medium">{selectedSupportTicket.message}</div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="text-slate-500 font-black uppercase tracking-[0.24em] text-[11px]">Шаги</div>
                <div className="mt-2 space-y-2 text-slate-100 font-medium">
                  {parseSupportSteps(selectedSupportTicket.steps_json).length
                    ? parseSupportSteps(selectedSupportTicket.steps_json).map((step, index) => (
                      <div key={index} className="rounded-xl border border-slate-800 bg-slate-950/50 px-3 py-2">
                        {index + 1}. {step}
                      </div>
                    ))
                    : <div className="text-slate-500">Не указаны</div>}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="text-slate-500 font-black uppercase tracking-[0.24em] text-[11px]">Вложения</div>
                <div className="mt-3 space-y-3">
                  {(selectedSupportTicket.attachments || []).map((attachment, index) => (
                    <div key={`${attachment.name}-${index}`} className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3">
                      <div className="flex items-center gap-2 font-black text-slate-100">
                        {attachment.kind === "photo" && <ImageUp className="h-4 w-4 text-cyan-300" />}
                        {attachment.kind === "video" && <Video className="h-4 w-4 text-violet-300" />}
                        {attachment.kind === "voice" && <Mic className="h-4 w-4 text-emerald-300" />}
                        {attachment.kind === "file" && <Paperclip className="h-4 w-4 text-slate-300" />}
                        <span className="truncate">{attachment.name}</span>
                      </div>
                      <div className="mt-1 text-slate-500 text-sm font-semibold">{attachment.mime} · {attachment.size} bytes</div>
                      {attachment.kind === "photo" && (
                        <img src={attachment.data_url} alt={attachment.name} className="mt-2 max-h-64 w-full rounded-2xl object-cover" />
                      )}
                      {attachment.kind === "video" && (
                        <video className="mt-2 w-full rounded-2xl" controls src={attachment.data_url} />
                      )}
                      {attachment.kind === "voice" && (
                        <audio className="mt-2 w-full" controls src={attachment.data_url} />
                      )}
                    </div>
                  ))}
                  {(!selectedSupportTicket.attachments || selectedSupportTicket.attachments.length === 0) && (
                    <div className="text-slate-500 font-semibold">Вложений нет.</div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
                <div className="text-slate-500 font-black uppercase tracking-[0.24em] text-[11px]">Статус</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <div className="inline-flex rounded-full border border-slate-700 bg-slate-950/50 px-3 py-1 text-xs font-black text-slate-200">{selectedSupportTicket.status}</div>
                  <div className="inline-flex rounded-full border border-slate-700 bg-slate-950/50 px-3 py-1 text-xs font-black text-slate-200">{selectedSupportTicket.priority}</div>
                  <div className="inline-flex rounded-full border border-slate-700 bg-slate-950/50 px-3 py-1 text-xs font-black text-slate-200">{selectedSupportTicket.category}</div>
                </div>
                <div className="mt-3 space-y-1 text-sm font-semibold text-slate-400">
                  <div>Назначен: {selectedSupportTicket.assigned_admin_user_id || "не назначен"}</div>
                  <div>Последний ответ: {formatTimestamp(selectedSupportTicket.last_reply_at || selectedSupportTicket.updated_at)}</div>
                  <div>Закрыт: {formatTimestamp(selectedSupportTicket.closed_at)}</div>
                  <div>Решён: {formatTimestamp(selectedSupportTicket.resolved_at)}</div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
                <div className="text-slate-500 font-black uppercase tracking-[0.24em] text-[11px]">Диалог</div>
                <div className="max-h-[24rem] overflow-auto space-y-3 pr-1">
                  {(selectedSupportTicket.messages || []).map((message) => (
                    <div key={message.id} className={`rounded-2xl border p-3 ${message.author_role === "admin" ? "border-cyan-500/20 bg-cyan-500/5" : "border-slate-800 bg-slate-950/50"}`}>
                      <div className="flex items-center justify-between gap-3">
                        <div className="text-sm font-black text-slate-100">
                          {message.author_role === "admin" ? "Админ" : "Клиент"}
                        </div>
                        <div className="text-xs font-semibold text-slate-500">{formatTimestamp(message.created_at)}</div>
                      </div>
                      <div className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-200">{message.message || "—"}</div>
                      {!!message.attachments?.length && (
                        <div className="mt-3 space-y-2">
                          {message.attachments.map((attachment, index) => (
                            <div key={`${message.id}-${attachment.name}-${index}`} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                              <div className="flex items-center gap-2 font-black text-slate-100">
                                {attachment.kind === "photo" && <ImageUp className="h-4 w-4 text-cyan-300" />}
                                {attachment.kind === "video" && <Video className="h-4 w-4 text-violet-300" />}
                                {attachment.kind === "voice" && <Mic className="h-4 w-4 text-emerald-300" />}
                                {attachment.kind === "file" && <Paperclip className="h-4 w-4 text-slate-300" />}
                                <span className="truncate">{attachment.name}</span>
                              </div>
                              {attachment.kind === "photo" && <img src={attachment.data_url} alt={attachment.name} className="mt-2 max-h-56 w-full rounded-2xl object-cover" />}
                              {attachment.kind === "video" && <video className="mt-2 w-full rounded-2xl" controls src={attachment.data_url} />}
                              {attachment.kind === "voice" && <audio className="mt-2 w-full" controls src={attachment.data_url} />}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {(!selectedSupportTicket.messages || selectedSupportTicket.messages.length === 0) && (
                    <div className="text-slate-500 font-semibold">Диалог пока пуст.</div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 space-y-3">
                <div className="text-slate-500 font-black uppercase tracking-[0.24em] text-[11px]">Обработка обращения</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="space-y-2">
                    <span className="text-xs font-black text-slate-400">Статус</span>
                    <select
                      value={supportTicketStatusDraft}
                      onChange={(e) => setSupportTicketStatusDraft(e.target.value)}
                      className="w-full rounded-2xl bg-slate-950/50 border border-slate-800 px-4 py-3 text-slate-100"
                    >
                      <option value="new">new</option>
                      <option value="in_progress">in_progress</option>
                      <option value="waiting_user">waiting_user</option>
                      <option value="resolved">resolved</option>
                      <option value="closed">closed</option>
                    </select>
                  </label>
                  <label className="space-y-2">
                    <span className="text-xs font-black text-slate-400">Приоритет</span>
                    <select
                      value={supportTicketPriorityDraft}
                      onChange={(e) => setSupportTicketPriorityDraft(e.target.value)}
                      className="w-full rounded-2xl bg-slate-950/50 border border-slate-800 px-4 py-3 text-slate-100"
                    >
                      <option value="low">low</option>
                      <option value="normal">normal</option>
                      <option value="high">high</option>
                      <option value="urgent">urgent</option>
                    </select>
                  </label>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSupportTicketAssignDraft("me")}
                    className={`px-3 py-2 rounded-2xl font-black border ${supportTicketAssignDraft === "me" ? "border-cyan-500/30 bg-cyan-500/15 text-cyan-100" : "border-slate-700 bg-slate-900/70 text-slate-200"}`}
                  >
                    Назначить на меня
                  </button>
                  <button
                    onClick={() => setSupportTicketAssignDraft("none")}
                    className={`px-3 py-2 rounded-2xl font-black border ${supportTicketAssignDraft === "none" ? "border-amber-500/30 bg-amber-500/15 text-amber-100" : "border-slate-700 bg-slate-900/70 text-slate-200"}`}
                  >
                    Снять назначение
                  </button>
                </div>
                <label className="space-y-2 block">
                  <span className="text-xs font-black text-slate-400">Внутренняя заметка</span>
                  <textarea
                    value={supportTicketAdminNoteDraft}
                    onChange={(e) => setSupportTicketAdminNoteDraft(e.target.value)}
                    rows={3}
                    className="w-full rounded-2xl bg-slate-950/50 border border-slate-800 px-4 py-3 text-slate-100 resize-y"
                    placeholder="Эту заметку видит только админка"
                  />
                </label>
                <label className="space-y-2 block">
                  <span className="text-xs font-black text-slate-400">Ответ клиенту</span>
                  <textarea
                    value={supportTicketReplyDraft}
                    onChange={(e) => setSupportTicketReplyDraft(e.target.value)}
                    rows={4}
                    className="w-full rounded-2xl bg-slate-950/50 border border-slate-800 px-4 py-3 text-slate-100 resize-y"
                    placeholder="Например: воспроизвели ошибку, исправление уже в работе"
                  />
                </label>
                <button
                  onClick={() => void saveSupportTicket()}
                  disabled={supportTicketSaving}
                  className={`w-full px-4 py-3 rounded-2xl font-black ${supportTicketSaving ? "bg-slate-800 text-slate-500" : "bg-cyan-500/15 hover:bg-cyan-500/25 text-cyan-100 border border-cyan-500/30"}`}
                >
                  {supportTicketSaving ? "Сохраняем..." : "Сохранить статус и ответ"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Feature flags */}
      <div className="rounded-3xl bg-slate-900/60 border border-slate-800 p-6">
        <div className="flex items-center justify-between gap-4 mb-4">
          <div>
            <h2 className="text-xl font-black text-slate-100">Feature Flags</h2>
            <p className="text-slate-400 font-medium">Мгновенно включай/выключай функции без деплоя.</p>
          </div>
        </div>

        <div className="space-y-3">
          {flags.map((flag) => {
            const dirty = flagsDirty[flag.key];
            const enabled = dirty ? dirty.enabled : asBool(flag.enabled);
            const rollout = dirty ? dirty.rollout : Number(flag.rollout_percentage ?? 100);
            const hasChanges = !!dirty && (dirty.enabled !== asBool(flag.enabled) || dirty.rollout !== Number(flag.rollout_percentage ?? 100));
            return (
              <div key={flag.key} className="flex flex-col md:flex-row md:items-center gap-3 md:gap-6 p-4 rounded-2xl bg-slate-950/40 border border-slate-800">
                <div className="flex-1">
                  <div className="text-slate-100 font-black">{flag.key}</div>
                  <div className="text-slate-500 font-semibold text-sm">Rollout: {rollout}%</div>
                </div>

                <div className="flex items-center gap-3">
                  <button onClick={() => toggleFlag(flag)} className="px-3 py-2 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold flex items-center gap-2">
                    {enabled ? <ToggleRight className="text-emerald-400" /> : <ToggleLeft className="text-slate-500" />}
                    {enabled ? "Включено" : "Выключено"}
                  </button>

                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={rollout}
                    onChange={(e) => setRollout(flag, Number(e.target.value))}
                    className="w-40"
                  />

                  <button
                    disabled={!hasChanges || loading}
                    onClick={() => saveFlag(flag.key)}
                    className={`px-4 py-2 rounded-2xl font-black ${hasChanges ? "bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-200" : "bg-slate-800 text-slate-500"}`}
                  >
                    Сохранить
                  </button>
                </div>
              </div>
            );
          })}
          {flags.length === 0 && <div className="text-slate-500 font-semibold">Флаги не найдены.</div>}
        </div>
      </div>

      
      {/* AI Monitoring */}
      <div className="rounded-3xl bg-slate-900/60 border border-slate-800 p-6 mb-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-xl font-black text-slate-100">AI мониторинг</h2>
            <div className="text-slate-300 font-semibold mt-1">
              Согласованные метрики и логи вызовов AI (для поддержки и контроля качества).
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-slate-300 font-semibold">Безопасный режим</div>
            <button
              className="px-3 py-2 rounded-2xl bg-slate-800 border border-slate-700 text-slate-100 font-bold"
              onClick={() => {
                const key = "ai_safe_mode";
                const current = asBool(flagsDirty[key]?.enabled ?? (flags.find(x => x.key === key)?.enabled));
                setFlagsDirty(prev => ({ ...prev, [key]: { enabled: !current, rollout: prev[key]?.rollout ?? Number(flags.find(x => x.key === key)?.rollout_percentage ?? 100) } }));
              }}
              title="Ограничивает дневные лимиты и принуждает структурированный (JSON) вывод"
            >
              {asBool(flagsDirty["ai_safe_mode"]?.enabled ?? (flags.find(x => x.key === "ai_safe_mode")?.enabled)) ? "ВКЛ" : "ВЫКЛ"}
            </button>

            <button
              className="px-3 py-2 rounded-2xl bg-slate-800 border border-slate-700 text-slate-100 font-bold"
              onClick={() => {
                const key = "ai_fallback_mode";
                const current = asBool(flagsDirty[key]?.enabled ?? (flags.find(x => x.key === key)?.enabled));
                setFlagsDirty(prev => ({ ...prev, [key]: { enabled: !current, rollout: prev[key]?.rollout ?? Number(flags.find(x => x.key === key)?.rollout_percentage ?? 100) } }));
              }}
              title="Если AI недоступен/квота/5xx — возвращаем упрощённый план/меню вместо ошибки"
            >
              Fallback: {asBool(flagsDirty["ai_fallback_mode"]?.enabled ?? (flags.find(x => x.key === "ai_fallback_mode")?.enabled)) ? "ВКЛ" : "ВЫКЛ"}
            </button>

            <button
              className="px-3 py-2 rounded-2xl bg-emerald-600/20 border border-emerald-500/40 text-emerald-200 font-black"
              onClick={async () => { await saveFlags(); await loadAll(); }}
            >
              Сохранить
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <div className="rounded-2xl bg-slate-950/40 border border-slate-800 p-4">
            <div className="text-slate-400 font-bold">AI вызовы (usage_daily)</div>
            <div className="text-3xl font-black text-slate-100 mt-1">{stats?.today?.ai_calls ?? 0}</div>
          </div>
          <div className="rounded-2xl bg-slate-950/40 border border-slate-800 p-4">
            <div className="text-slate-400 font-bold">AI вызовы (ai_events)</div>
            <div className="text-3xl font-black text-slate-100 mt-1">{stats?.today?.ai_event_calls ?? stats?.today?.ai_calls_events ?? 0}</div>
            <div className="text-slate-400 font-semibold mt-1">Ошибки: {stats?.today?.ai_event_errors ?? stats?.today?.ai_errors_events ?? 0}</div>
          </div>
          <div className="rounded-2xl bg-slate-950/40 border border-slate-800 p-4">
            <div className="text-slate-400 font-bold">Средняя задержка</div>
            <div className="text-3xl font-black text-slate-100 mt-1">{stats?.today?.ai_event_avg_latency_ms ?? stats?.today?.ai_avg_latency_ms ?? 0} ms</div>
          </div>
        </div>

        <div className="flex items-center gap-3 mt-5 flex-wrap">
          <div className="text-slate-300 font-semibold">Фильтр feature:</div>
          <input
            value={aiLogFeature}
            onChange={(e) => setAiLogFeature(e.target.value)}
            placeholder="например: weekly_menu"
            className="px-3 py-2 rounded-2xl bg-slate-950/40 border border-slate-800 text-slate-100 font-semibold"
          />
          <div className="text-slate-300 font-semibold">Лимит:</div>
          <input
            type="number"
            value={aiLogLimit}
            min={10}
            max={200}
            onChange={(e) => setAiLogLimit(Number(e.target.value || 50))}
            className="w-24 px-3 py-2 rounded-2xl bg-slate-950/40 border border-slate-800 text-slate-100 font-semibold"
          />
          <button
            className="px-3 py-2 rounded-2xl bg-slate-800 border border-slate-700 text-slate-100 font-bold"
            onClick={loadAiLogs}
          >
            Обновить логи
          </button>
        </div>

        <div className="mt-4 overflow-auto rounded-2xl border border-slate-800">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-950/50 text-slate-300">
              <tr>
                <th className="text-left px-3 py-2 font-black">Время</th>
                <th className="text-left px-3 py-2 font-black">Feature</th>
                <th className="text-left px-3 py-2 font-black">Статус</th>
                <th className="text-left px-3 py-2 font-black">Latency</th>
                <th className="text-left px-3 py-2 font-black">Safe</th>
                <th className="text-left px-3 py-2 font-black">User</th>
                <th className="text-left px-3 py-2 font-black">Ошибка</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-100">
              {aiLogs.length === 0 && (
                <tr><td className="px-3 py-3 text-slate-400 font-semibold" colSpan={7}>Логов пока нет.</td></tr>
              )}
              {aiLogs.map((l) => (
                <tr key={l.id} className="hover:bg-slate-950/40">
                  <td className="px-3 py-2 text-slate-300 font-semibold">{new Date(l.ts).toLocaleString()}</td>
                  <td className="px-3 py-2 font-bold">{l.feature}</td>
                  <td className="px-3 py-2 font-black">{l.status}</td>
                  <td className="px-3 py-2 font-bold">{l.latency_ms}ms</td>
                  <td className="px-3 py-2 font-bold">{Number(l.safe_mode) === 1 ? "Да" : "Нет"}</td>
                  <td className="px-3 py-2 text-slate-300 font-semibold">{l.user_id.slice(0, 8)}…</td>
                  <td className="px-3 py-2 text-slate-300 font-semibold">{l.error || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

{/* Users + roles + sessions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-3xl bg-slate-900/60 border border-slate-800 p-6">
          <h2 className="text-xl font-black text-slate-100 mb-2">Пользователи</h2>
          <div className="text-slate-500 font-semibold text-sm mb-2">Найдено: {usersTotal}</div>
          <p className="text-slate-400 font-medium mb-4">Список пользователей, фильтры и быстрый вход в карточку профиля.</p>

          <div className="grid grid-cols-2 xl:grid-cols-6 gap-2 mb-4">
            <select value={userStatusFilter} onChange={(e) => setUserStatusFilter(e.target.value)} className="px-3 py-2 rounded-2xl bg-slate-950/50 border border-slate-800 text-slate-200 font-semibold">
              <option value="all">Все статусы</option>
              <option value="active">Активные</option>
              <option value="inactive">Неактивные</option>
              <option value="deleted">Удалённые</option>
            </select>
            <select value={userPlanFilter} onChange={(e) => setUserPlanFilter(e.target.value)} className="px-3 py-2 rounded-2xl bg-slate-950/50 border border-slate-800 text-slate-200 font-semibold">
              <option value="all">Все тарифы</option>
              <option value="free">Free</option>
              <option value="pro">Pro</option>
              <option value="family">Family</option>
            </select>
            <select value={wearableFilter} onChange={(e) => setWearableFilter(e.target.value)} className="px-3 py-2 rounded-2xl bg-slate-950/50 border border-slate-800 text-slate-200 font-semibold">
              <option value="all">Wearable: все</option>
              <option value="connected">Подключён</option>
              <option value="disconnected">Не подключён</option>
            </select>
            <select value={glucoseFilter} onChange={(e) => setGlucoseFilter(e.target.value)} className="px-3 py-2 rounded-2xl bg-slate-950/50 border border-slate-800 text-slate-200 font-semibold">
              <option value="all">Сахар: все</option>
              <option value="yes">Есть</option>
              <option value="no">Нет</option>
            </select>
            <select value={measurementFilter} onChange={(e) => setMeasurementFilter(e.target.value)} className="px-3 py-2 rounded-2xl bg-slate-950/50 border border-slate-800 text-slate-200 font-semibold">
              <option value="all">Замеры: все</option>
              <option value="yes">Есть</option>
              <option value="no">Нет</option>
            </select>
            <input
              type="number"
              min={10}
              max={200}
              value={userListLimit}
              onChange={(e) => setUserListLimit(Math.max(10, Math.min(200, Number(e.target.value || 50))))}
              className="px-3 py-2 rounded-2xl bg-slate-950/50 border border-slate-800 text-slate-200 font-semibold"
            />
          </div>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600" size={18} />
              <input
                value={userQuery}
                onChange={(e) => setUserQuery(e.target.value)}
                placeholder="email или user_id…"
                className="w-full pl-10 pr-3 py-2 rounded-2xl bg-slate-950/50 border border-slate-800 text-slate-200 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>
            <button onClick={() => void loadUsers()} className="px-4 py-2 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold">
              Обновить список
            </button>
          </div>

          <div className="space-y-2 max-h-[320px] overflow-auto pr-1">
            {users.map((u) => (
              <button
                key={u.id}
                onClick={() => { setSelectedUserId(u.id); void loadUserDetails(u.id); }}
                className={`w-full text-left p-3 rounded-2xl border ${selectedUserId === u.id ? "border-indigo-500/40 bg-indigo-500/10" : "border-slate-800 bg-slate-950/40 hover:bg-slate-900/40"}`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-slate-100 font-black text-sm truncate">{u.name || u.email || u.id}</div>
                    <div className="text-slate-500 font-semibold text-xs truncate">{u.email || u.id}</div>
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <span className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-200 text-[11px] font-black uppercase">{u.subscription_plan || "free"}</span>
                    <span className={`px-2.5 py-1 rounded-full text-[11px] font-black uppercase ${u.deleted_at ? "bg-rose-500/10 text-rose-200" : u.is_active ? "bg-emerald-500/10 text-emerald-200" : "bg-amber-500/10 text-amber-200"}`}>
                      {u.deleted_at ? "deleted" : u.is_active ? "active" : "inactive"}
                    </span>
                    {u.wearable_enabled ? <span className="px-2.5 py-1 rounded-full bg-cyan-500/10 text-cyan-200 text-[11px] font-black uppercase">wearable</span> : null}
                    {u.glucose_has_data ? <span className="px-2.5 py-1 rounded-full bg-fuchsia-500/10 text-fuchsia-200 text-[11px] font-black uppercase">glucose</span> : null}
                  </div>
                </div>
                <div className="mt-2 text-slate-500 font-semibold text-xs flex flex-wrap gap-x-3 gap-y-1">
                  <span>{u.id}</span>
                  <span>замеры: {u.measurements_count || 0}</span>
                  <span>фото: {u.progress_photos_count || 0}</span>
                  <span>семья: {u.family_members_count || 0}</span>
                </div>
              </button>
            ))}
            {users.length === 0 && <div className="text-slate-500 font-semibold">Пока нет данных. Нажмите «Обновить список».</div>}
          </div>
        </div>

        <div className="rounded-3xl bg-slate-900/60 border border-slate-800 p-6 space-y-6">
          <div>
            <h2 className="text-xl font-black text-slate-100">Детали пользователя</h2>
            <p className="text-slate-400 font-medium">
              Выбран: <span className="text-slate-200 font-black">{selectedUserLabel || "—"}</span>
            </p>
          </div>

          <div className="rounded-2xl bg-slate-950/40 border border-slate-800 p-4 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-slate-100 font-black text-lg">
                  {selectedUserDetail?.user?.name || selectedUserLabel || "Пользователь не выбран"}
                </div>
                <div className="text-slate-500 font-semibold text-sm break-all">
                  {selectedUserDetail?.user?.email || selectedUserId || "Нажмите на пользователя слева или в таблице выше."}
                </div>
              </div>
              <div className="flex flex-col items-end gap-2">
                <span className="px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/30 text-indigo-100 text-xs font-black uppercase tracking-wider">
                  {selectedUserDetail?.subscription?.plan || "free"}
                </span>
                <span className="px-3 py-1 rounded-full bg-slate-800 text-slate-300 text-xs font-bold">
                  {selectedUserDetail?.subscription?.status || "inactive"}
                </span>
                {selectedUserDetail?.subscription?.current_period_end ? (
                  <span className="text-xs text-slate-500 font-semibold">
                    до {formatTimestamp(selectedUserDetail.subscription.current_period_end)}
                  </span>
                ) : null}
              </div>
            </div>

            {selectedUserDetail ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500 font-black">user_id</div>
                  <div className="mt-1 text-slate-100 font-mono text-xs break-all">{selectedUserDetail.user.id}</div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500 font-black">Создан</div>
                  <div className="mt-1 text-slate-100 font-black text-sm">{formatTimestamp(selectedUserDetail.user.created_at)}</div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500 font-black">Сессии</div>
                  <div className="mt-1 text-slate-100 font-black text-sm">
                    {selectedUserDetail.summary.active_sessions}/{selectedUserDetail.summary.total_sessions}
                  </div>
                  <div className="text-xs text-slate-500 mt-1">живые / всего</div>
                </div>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3">
                  <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500 font-black">Лимит сессии</div>
                  <div className="mt-1 text-slate-100 font-black text-sm">
                    {selectedUserDetail.summary.session_ttl_days} дн.
                  </div>
                  <div className="text-xs text-slate-500 mt-1">авто-истечение</div>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-950/30 p-4 text-slate-500 font-semibold text-sm">
                Нажмите на строку в таблице сверху, чтобы увидеть email, роли, план, срок жизни сессий и AI-активность.
              </div>
            )}

            {selectedUserDetail && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                  <div className="text-slate-500 font-black text-[11px] uppercase tracking-[0.2em]">Профиль</div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <div className="text-slate-500 font-bold text-[11px] uppercase">Вес / цель</div>
                      <div className="text-slate-100 font-black">{selectedUserDetail.profile.weight ?? "—"} кг</div>
                      <div className="text-slate-500 font-semibold text-xs">цель: {selectedUserDetail.profile.target_weight ?? "—"} кг</div>
                    </div>
                    <div>
                      <div className="text-slate-500 font-bold text-[11px] uppercase">Рост / возраст</div>
                      <div className="text-slate-100 font-black">{selectedUserDetail.profile.height ?? "—"} см</div>
                      <div className="text-slate-500 font-semibold text-xs">возраст: {selectedUserDetail.profile.age ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-slate-500 font-bold text-[11px] uppercase">Цель</div>
                      <div className="text-slate-100 font-black">{selectedUserDetail.profile.goal || "—"}</div>
                      <div className="text-slate-500 font-semibold text-xs">версия профиля: {selectedUserDetail.profile.version ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-slate-500 font-bold text-[11px] uppercase">Замеры</div>
                      <div className="text-slate-100 font-black">{selectedUserDetail.profile.measurements_count ?? 0}</div>
                      <div className="text-slate-500 font-semibold text-xs">фото: {selectedUserDetail.profile.progress_photos_count ?? 0}</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                  <div className="text-slate-500 font-black text-[11px] uppercase tracking-[0.2em]">Здоровье</div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <div className="text-slate-500 font-bold text-[11px] uppercase">Давление</div>
                      <div className="text-slate-100 font-black">{selectedUserDetail.profile.blood_pressure_systolic ?? "—"} / {selectedUserDetail.profile.blood_pressure_diastolic ?? "—"}</div>
                      <div className="text-slate-500 font-semibold text-xs">{selectedUserDetail.profile.blood_pressure_measured_at ? formatTimestamp(selectedUserDetail.profile.blood_pressure_measured_at) : "не измерялось"}</div>
                    </div>
                    <div>
                      <div className="text-slate-500 font-bold text-[11px] uppercase">Сахар</div>
                      <div className="text-slate-100 font-black">{selectedUserDetail.profile.blood_glucose_mmol_l ?? "—"} ммоль/л</div>
                      <div className="text-slate-500 font-semibold text-xs">{selectedUserDetail.profile.blood_glucose_measured_at ? formatTimestamp(selectedUserDetail.profile.blood_glucose_measured_at) : "не измерялось"}</div>
                    </div>
                    <div>
                      <div className="text-slate-500 font-bold text-[11px] uppercase">Пульс / сон</div>
                      <div className="text-slate-100 font-black">{selectedUserDetail.profile.resting_pulse ?? "—"} уд/мин</div>
                      <div className="text-slate-500 font-semibold text-xs">сон: {selectedUserDetail.profile.wearable_sleep_hours_last_night ?? "—"} ч</div>
                    </div>
                    <div>
                      <div className="text-slate-500 font-bold text-[11px] uppercase">Обхваты</div>
                      <div className="text-slate-100 font-black">
                        Т/Г/Б: {selectedUserDetail.profile.waist_cm ?? "—"} / {selectedUserDetail.profile.chest_cm ?? "—"} / {selectedUserDetail.profile.hips_cm ?? "—"}
                      </div>
                      <div className="text-slate-500 font-semibold text-xs">измерения: {selectedUserDetail.profile.body_measurements_measured_at ? formatTimestamp(selectedUserDetail.profile.body_measurements_measured_at) : "—"}</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                  <div className="text-slate-500 font-black text-[11px] uppercase tracking-[0.2em]">Wearable</div>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <div className="text-slate-500 font-bold text-[11px] uppercase">Источник</div>
                      <div className="text-slate-100 font-black">{selectedUserDetail.profile.wearable_provider || "—"}</div>
                      <div className="text-slate-500 font-semibold text-xs">{selectedUserDetail.profile.wearable_enabled ? "подключён" : "не подключён"}</div>
                    </div>
                    <div>
                      <div className="text-slate-500 font-bold text-[11px] uppercase">Последний sync</div>
                      <div className="text-slate-100 font-black">{selectedUserDetail.profile.wearable_last_sync_at ? formatTimestamp(selectedUserDetail.profile.wearable_last_sync_at) : "—"}</div>
                      <div className="text-slate-500 font-semibold text-xs">обновлён: {selectedUserDetail.profile.wearable_metrics_updated_at ? formatTimestamp(selectedUserDetail.profile.wearable_metrics_updated_at) : "—"}</div>
                    </div>
                    <div>
                      <div className="text-slate-500 font-bold text-[11px] uppercase">Шаги</div>
                      <div className="text-slate-100 font-black">{selectedUserDetail.profile.wearable_steps_today ?? "—"}</div>
                      <div className="text-slate-500 font-semibold text-xs">минуты: {selectedUserDetail.profile.wearable_active_minutes_today ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-slate-500 font-bold text-[11px] uppercase">Подключение</div>
                      <div className="text-slate-100 font-black">{selectedUserDetail.profile.wearable_connected_at ? formatTimestamp(selectedUserDetail.profile.wearable_connected_at) : "—"}</div>
                      <div className="text-slate-500 font-semibold text-xs">sync: {selectedUserDetail.profile.wearable_last_sync_at ? "есть" : "нет"}</div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-4">
                  <div className="text-slate-500 font-black text-[11px] uppercase tracking-[0.2em]">Семья и исключения</div>
                  <div className="mt-2 space-y-2 text-sm">
                    <div className="text-slate-100 font-black">
                      {selectedUserDetail.family ? selectedUserDetail.family.family_name : "Нет активной семьи"}
                    </div>
                    {selectedUserDetail.family ? (
                      <div className="text-slate-500 font-semibold text-xs">
                        role: {selectedUserDetail.family.member_role} · active members: {selectedUserDetail.family.active_members}
                      </div>
                    ) : null}
                    <div>
                      <div className="text-slate-500 font-bold text-[11px] uppercase">Ограничения</div>
                      <div className="text-slate-100 font-medium whitespace-pre-wrap">
                        {selectedUserDetail.profile.medical_restrictions || "—"}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-500 font-bold text-[11px] uppercase">Семейные исключения</div>
                      <div className="text-slate-100 font-medium whitespace-pre-wrap">
                        {selectedUserDetail.profile.family_exclusions || "—"}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {selectedUserDetail && (
              <>
                <div className="rounded-2xl border border-slate-800 bg-slate-950/50 p-3">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-slate-500 font-bold">Роли:</span>
                    {selectedUserDetail.roles.length > 0 ? (
                      selectedUserDetail.roles.map((r) => (
                        <span key={r} className="px-2.5 py-1 rounded-full bg-slate-800 text-slate-200 font-bold text-xs">
                          {r}
                        </span>
                      ))
                    ) : (
                      <span className="text-slate-500 font-semibold">нет</span>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-3">
                      <div className="text-slate-500 font-black text-[11px] uppercase tracking-[0.2em]">AI за 7 дней</div>
                      <div className="mt-1 text-slate-100 font-black">{selectedUserDetail.summary.ai_calls_7d} вызовов</div>
                      <div className="text-slate-500 font-semibold text-xs mt-1">
                        ${selectedUserDetail.summary.ai_cost_7d.toFixed(4)} · {selectedUserDetail.summary.ai_tokens_7d} токенов
                      </div>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-3">
                      <div className="text-slate-500 font-black text-[11px] uppercase tracking-[0.2em]">Состояние</div>
                      <div className="mt-1 text-slate-100 font-black">
                        {selectedUserDetail.user.is_active ? "Активен" : "Неактивен"}
                      </div>
                      <div className="text-slate-500 font-semibold text-xs mt-1">
                        ошибок {selectedUserDetail.summary.ai_errors_7d} · fallback {selectedUserDetail.summary.ai_fallback_7d}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-4 mt-3">
                  <div className="text-slate-100 font-black mb-2">Тариф без оплаты</div>
                  <div className="text-slate-500 font-semibold text-sm mb-3">
                    Ручное переключение для теста нагрузки и проверки SaaS-потока.
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {(["free", "pro", "family"] as SubscriptionPlan[]).map((plan) => (
                      <button
                        key={plan}
                        onClick={() => setSubscriptionPlanDraft(plan)}
                        className={`px-4 py-2 rounded-2xl font-black border ${subscriptionPlanDraft === plan ? "bg-indigo-500/15 border-indigo-500/30 text-indigo-100" : "bg-slate-800/50 border-slate-700 text-slate-200 hover:bg-slate-800"}`}
                      >
                        {plan}
                      </button>
                    ))}
                    <button
                      disabled={!selectedUserId || loading}
                      onClick={() => void saveSubscriptionPlan()}
                      className="px-4 py-2 rounded-2xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-100 font-black border border-emerald-500/30"
                    >
                      Применить
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="rounded-2xl bg-slate-950/40 border border-slate-800 p-4">
            <div className="text-slate-100 font-black mb-2 flex items-center gap-2">
              <BadgeInfo size={18} className="text-indigo-300" />
              Роли и доступ
            </div>
            <p className="text-slate-400 font-medium">Редактируйте доступ выбранного пользователя ниже.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            {roles.map((r) => (
              <span key={r} className="px-3 py-1 rounded-2xl bg-slate-800 text-slate-200 font-bold flex items-center gap-2">
                {r}
                {r !== "user" && (
                  <button onClick={() => mutateRole("remove", r)} className="text-rose-300 hover:text-rose-200">
                    <Trash2 size={14} />
                  </button>
                )}
              </span>
            ))}
            {roles.length === 0 && <span className="text-slate-500 font-semibold">Роли не загружены.</span>}
          </div>

          <div className="flex items-center gap-3">
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              className="px-3 py-2 rounded-2xl bg-slate-950/50 border border-slate-800 text-slate-200 font-semibold"
            >
              {["pro", "family_parent", "family_child", "support", "admin"].map((r) => (
                <option value={r} key={r}>{r}</option>
              ))}
            </select>
            <button
              disabled={!selectedUserId || loading}
              onClick={() => mutateRole("add", newRole)}
              className="px-4 py-2 rounded-2xl bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-200 font-black"
            >
              Добавить роль
            </button>
          </div>

          <div className="rounded-2xl bg-slate-950/40 border border-slate-800 p-4">
            <div className="text-slate-100 font-black mb-2">Сессии пользователя</div>
            <div className="text-slate-500 font-semibold text-sm mb-3">
              Сессии привязаны к выбранному пользователю и автоматически истекают через {selectedUserDetail?.summary.session_ttl_days || 30} дн.
            </div>
            <div className="space-y-2 max-h-[220px] overflow-auto pr-1">
              {sessions.map((s) => (
                <div key={s.id} className="p-3 rounded-2xl bg-slate-950/40 border border-slate-800 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-slate-200 font-bold text-sm truncate">{s.id}</div>
                    <div className="text-slate-500 font-semibold text-xs">
                      created: {formatTimestamp(s.created_at)} · expires: {formatTimestamp(s.expires_at)}
                    </div>
                    <div className="text-slate-600 font-semibold text-xs flex items-center gap-2 mt-0.5">
                      <Clock3 size={12} />
                      {s.revoked ? "отозвана" : `живёт ${formatDuration(s.ttl_seconds || Math.max(0, (s.expires_at || 0) - (s.created_at || 0)))}`}
                      {s.revoked === 0 && (s.remaining_seconds ?? 0) > 0 ? ` · осталось ${formatDuration(s.remaining_seconds)}` : ""}
                    </div>
                    {s.ip && <div className="text-slate-600 font-semibold text-xs">IP: {s.ip}</div>}
                    {s.user_agent && <div className="text-slate-600 font-semibold text-xs truncate">{s.user_agent}</div>}
                  </div>
                  <button
                    disabled={loading || !!s.revoked}
                    onClick={() => revokeSession(s.id)}
                    className={`px-3 py-2 rounded-2xl font-black ${s.revoked ? "bg-slate-800 text-slate-500" : "bg-rose-500/10 hover:bg-rose-500/20 text-rose-200"}`}
                  >
                    {s.revoked ? "Отозвана" : "Отозвать"}
                  </button>
                </div>
              ))}
              {sessions.length === 0 && <div className="text-slate-500 font-semibold">Сессии не найдены.</div>}
            </div>
          </div>
        </div>
      </div>

      {loading && (
        <div className="text-slate-500 font-semibold">Загрузка…</div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <div className="mb-3 flex items-center gap-2 text-white/90">
            <ShieldCheck className="h-5 w-5 text-indigo-300" />
            <div className="font-semibold">Администраторы</div>
          </div>
          <div className="space-y-2 text-sm text-white/80">
            {admins.length === 0 ? (
              <div className="text-white/60">Админы не найдены</div>
            ) : (
              admins.map((u) => (
                <div key={u.id} className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <div className="truncate">
                    <div className="truncate font-medium text-white/90">{u.email || u.id}</div>
                    <div className="truncate text-xs text-white/50">{u.id}</div>
                  </div>
                  <button
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-1 text-xs hover:bg-white/10"
                    onClick={() => { setSelectedUserId(u.id); void loadUserDetails(u.id); }}
                    title="Открыть роли"
                  >
                    Роли
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
          <div className="mb-3 flex items-center gap-2 text-white/90">
            <Activity className="h-5 w-5 text-indigo-300" />
            <div className="font-semibold">Журнал действий админа</div>
          </div>
          <div className="mb-2 flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1">
              <div className="text-xs text-white/60">Поиск</div>
              <input value={adminEventQ} onChange={(e)=>setAdminEventQ(e.target.value)} placeholder="email / action" className="h-9 w-56 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/40" />
            </div>
            <div className="flex flex-col gap-1">
              <div className="text-xs text-white/60">Action</div>
              <input value={adminEventAction} onChange={(e)=>setAdminEventAction(e.target.value)} placeholder="role_add" className="h-9 w-44 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white placeholder:text-white/40" />
            </div>
            <div className="flex flex-col gap-1">
              <div className="text-xs text-white/60">From</div>
              <input type="date" value={adminEventFrom} onChange={(e)=>setAdminEventFrom(e.target.value)} className="h-9 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white" />
            </div>
            <div className="flex flex-col gap-1">
              <div className="text-xs text-white/60">To</div>
              <input type="date" value={adminEventTo} onChange={(e)=>setAdminEventTo(e.target.value)} className="h-9 rounded-xl border border-white/10 bg-white/5 px-3 text-sm text-white" />
            </div>
            <button onClick={loadAdminEvents} className="h-9 rounded-xl bg-white/10 px-3 text-sm text-white hover:bg-white/20">Применить</button>
            <button onClick={exportAdminEventsCsv} className="h-9 rounded-xl bg-white/10 px-3 text-sm text-white hover:bg-white/20">Export CSV</button>
          </div>
          <div className="max-h-[360px] overflow-auto space-y-2 text-sm text-white/80">
            {adminEvents.length === 0 ? (
              <div className="text-white/60">Пока пусто</div>
            ) : (
              adminEvents.map((ev) => (
                <div key={ev.id} className="rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-medium text-white/90">{ev.action}</div>
                    <div className="text-xs text-white/50">{new Date(ev.ts).toLocaleString()}</div>
                  </div>
                  <div className="mt-1 text-xs text-white/60">
                    admin: {ev.admin_email || ev.admin_user_id}{ev.target_email ? ` → target: ${ev.target_email}` : ev.target_user_id ? ` → target: ${ev.target_user_id}` : ""}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

    </div>
  );
}
