import React, { useEffect, useMemo, useState } from "react";
import { ShieldCheck, ToggleLeft, ToggleRight, Users, KeyRound, Activity, RefreshCcw, Search, Trash2 } from "lucide-react";

type Flag = { key: string; enabled: number | boolean; rollout_percentage?: number };
type Stats = {
  totals: {
    users: number;
    active_sessions: number;
    pro_active: number;
    family_active: number;
  };
  today: {
    day: string;
    ai_calls: number;
    ai_calls_events?: number;
    ai_errors_events?: number;
    ai_avg_latency_ms?: number;
    meals_logged: number;
  };
};

type UserRow = { id: string; email?: string; created_at?: number };

type AiLog = { id: string; user_id: string; ts: number; feature: string; status: number; latency_ms: number; safe_mode: number; error?: string | null };

type SessionRow = { id: string; created_at: number; expires_at: number; revoked: number; user_agent?: string; ip?: string };

function asBool(v: any) { return v === true || v === 1 || v === "1"; }

export default function AdminScreen() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [stats, setStats] = useState<Stats | null>(null);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [flagsDirty, setFlagsDirty] = useState<Record<string, { enabled: boolean; rollout: number }>>({});

  const [userQuery, setUserQuery] = useState("");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");

  const [roles, setRoles] = useState<string[]>([]);
  const [newRole, setNewRole] = useState("pro");

  const [sessions, setSessions] = useState<SessionRow[]>([]);

  const [aiLogs, setAiLogs] = useState<AiLog[]>([]);
  const [aiLogLimit, setAiLogLimit] = useState(50);
  const [aiLogFeature, setAiLogFeature] = useState<string>("");

  const selectedUserLabel = useMemo(() => {
    const u = users.find(x => x.id === selectedUserId);
    return u ? (u.email || u.id) : selectedUserId;
  }, [users, selectedUserId]);

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

  const loadAll = async () => {
    setLoading(true); setErr(null);
    try {
      const [s, f] = await Promise.all([
        fetch("/api/admin/stats", { credentials: "include" }),
        fetch("/api/admin/feature_flags", { credentials: "include" }),
      ]);
      if (!s.ok) throw new Error("Нет доступа к /api/admin/stats (нужна роль admin)");
      if (!f.ok) throw new Error("Нет доступа к /api/admin/feature_flags (нужна роль admin)");
      const sj = await s.json();
      const fj = await f.json();
      setStats(sj?.stats || null);
      setFlags(Array.isArray(fj?.flags) ? fj.flags : []);
      setFlagsDirty({});
    } catch (e: any) {
      setErr(e?.message || "Ошибка загрузки");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadAll(); }, []);

  const searchUsers = async () => {
    setLoading(true); setErr(null);
    try {
      const r = await fetch(`/api/admin/users?query=${encodeURIComponent(userQuery.trim())}`, { credentials: "include" });
      if (!r.ok) throw new Error("Поиск пользователей недоступен (нужна роль admin)");
      const j = await r.json();
      setUsers(Array.isArray(j?.users) ? j.users : []);
    } catch (e: any) {
      setErr(e?.message || "Ошибка поиска");
    } finally {
      setLoading(false);
    }
  };

  const loadUserDetails = async (userId: string) => {
    if (!userId) return;
    setLoading(true); setErr(null);
    try {
      const [rr, sr] = await Promise.all([
        fetch(`/api/admin/user_roles?user_id=${encodeURIComponent(userId)}`, { credentials: "include" }),
        fetch(`/api/admin/sessions?user_id=${encodeURIComponent(userId)}`, { credentials: "include" }),
      ]);
      if (!rr.ok) throw new Error("Нет доступа к ролям пользователя");
      if (!sr.ok) throw new Error("Нет доступа к сессиям пользователя");
      const rj = await rr.json();
      const sj = await sr.json();
      setRoles(Array.isArray(rj?.roles) ? rj.roles : []);
      setSessions(Array.isArray(sj?.sessions) ? sj.sessions : []);
    } catch (e: any) {
      setErr(e?.message || "Ошибка загрузки пользователя");
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
                    className={\`px-4 py-2 rounded-2xl font-black \${hasChanges ? "bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-200" : "bg-slate-800 text-slate-500"}\`}
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
            <div className="text-3xl font-black text-slate-100 mt-1">{stats?.today?.ai_calls_events ?? 0}</div>
            <div className="text-slate-400 font-semibold mt-1">Ошибки: {stats?.today?.ai_errors_events ?? 0}</div>
          </div>
          <div className="rounded-2xl bg-slate-950/40 border border-slate-800 p-4">
            <div className="text-slate-400 font-bold">Средняя задержка</div>
            <div className="text-3xl font-black text-slate-100 mt-1">{stats?.today?.ai_avg_latency_ms ?? 0} ms</div>
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
          <p className="text-slate-400 font-medium mb-4">Найди пользователя по email или id, назначь роли.</p>

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
            <button onClick={searchUsers} className="px-4 py-2 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold">
              Найти
            </button>
          </div>

          <div className="space-y-2 max-h-[320px] overflow-auto pr-1">
            {users.map((u) => (
              <button
                key={u.id}
                onClick={() => { setSelectedUserId(u.id); void loadUserDetails(u.id); }}
                className={\`w-full text-left p-3 rounded-2xl border \${selectedUserId === u.id ? "border-indigo-500/40 bg-indigo-500/10" : "border-slate-800 bg-slate-950/40 hover:bg-slate-900/40"}\`}
              >
                <div className="text-slate-100 font-black text-sm">{u.email || u.id}</div>
                <div className="text-slate-500 font-semibold text-xs">{u.id}</div>
              </button>
            ))}
            {users.length === 0 && <div className="text-slate-500 font-semibold">Пока пусто. Сделай поиск.</div>}
          </div>
        </div>

        <div className="rounded-3xl bg-slate-900/60 border border-slate-800 p-6 space-y-6">
          <div>
            <h2 className="text-xl font-black text-slate-100">Роли и доступ</h2>
            <p className="text-slate-400 font-medium">Выбран: <span className="text-slate-200 font-black">{selectedUserLabel || "—"}</span></p>
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
            <div className="space-y-2 max-h-[220px] overflow-auto pr-1">
              {sessions.map((s) => (
                <div key={s.id} className="p-3 rounded-2xl bg-slate-950/40 border border-slate-800 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-slate-200 font-bold text-sm truncate">{s.id}</div>
                    <div className="text-slate-500 font-semibold text-xs">
                      created: {new Date((s.created_at || 0) * 1000).toLocaleString()} · expires: {new Date((s.expires_at || 0) * 1000).toLocaleString()}
                    </div>
                    {s.user_agent && <div className="text-slate-600 font-semibold text-xs truncate">{s.user_agent}</div>}
                  </div>
                  <button
                    disabled={loading || !!s.revoked}
                    onClick={() => revokeSession(s.id)}
                    className={\`px-3 py-2 rounded-2xl font-black \${s.revoked ? "bg-slate-800 text-slate-500" : "bg-rose-500/10 hover:bg-rose-500/20 text-rose-200"}\`}
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
    </div>
  );
}
