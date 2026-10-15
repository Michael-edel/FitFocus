import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import clsx from "clsx";
import { groupShoppingItemsByDepartment } from "./shoppingDepartments";
import { isRecord, parseJson } from "./safeJson";
import { requestFamilyJson } from './services/familySession';
import { assertReadSession } from './storage/sessionRead';
import type { OutboxReadGuard } from './storage/durableOutbox';
import { buildPersonalShoppingCsv } from './services/shoppingExport';

type ShoppingItem = {
  name: string;
  grams: number;
  checked: boolean;
  display_qty: string;
};

type ShoppingListPayloadItem = {
  name?: unknown;
  ingredient_name?: unknown;
  grams?: unknown;
  checked?: unknown;
  display_qty?: unknown;
  displayQty?: unknown;
};

type ShoppingItemsSnapshot = { scopeKey: string; items: ShoppingItem[] | null };
type FallbackCheckedSnapshot = { storageKey: string; checked: Record<string, boolean> };
const EMPTY_FALLBACK_CHECKED: Record<string, boolean> = {};

function formatShoppingQty(grams: number) {
  const rounded = Math.max(0, Math.round(Number(grams || 0)));
  if (!rounded) return "кол-во уточнить";
  if (rounded >= 1000) {
    const kg = Math.round((rounded / 1000) * 10) / 10;
    return `${String(kg).replace(".", ",")} кг`;
  }
  return `${rounded} г`;
}

function asPayloadItem(raw: unknown): ShoppingListPayloadItem {
  return isRecord(raw) ? raw : {};
}

function normalizeShoppingItem(raw: unknown): ShoppingItem | null {
  const item = asPayloadItem(raw);
  const rawName = typeof item.name === "string" ? item.name : typeof item.ingredient_name === "string" ? item.ingredient_name : "";
  const name = rawName.trim();
  if (!name) return null;
  const gramsValue = typeof item.grams === "number" || typeof item.grams === "string" ? Number(item.grams) : 0;
  const grams = Number.isFinite(gramsValue) ? Math.max(0, Math.round(gramsValue)) : 0;
  const rawDisplayQty = typeof item.display_qty === "string"
    ? item.display_qty
    : typeof item.displayQty === "string"
      ? item.displayQty
      : "";
  return {
    name,
    grams,
    checked: item.checked === true,
    display_qty: rawDisplayQty.trim() || formatShoppingQty(grams),
  };
}

export default function ShoppingListCard({
  weekStart,
  title = "Список покупок",
  fallbackList,
  userId,
  loginGuard,
  isCurrentSession,
}: {
  weekStart: string;
  title?: string;
  fallbackList?: string[];
  userId?: string | null;
  loginGuard: OutboxReadGuard | null;
  isCurrentSession: () => boolean;
}) {
  const [itemsSnapshot, setItemsSnapshot] = useState<ShoppingItemsSnapshot | null>(null);
  const [onlyUnchecked, setOnlyUnchecked] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [fallbackCheckedSnapshot, setFallbackCheckedSnapshot] = useState<FallbackCheckedSnapshot | null>(null);
  const [pageGeneration, setPageGeneration] = useState(0);
  const [csvExporting, setCsvExporting] = useState(false);
  const [csvExportError, setCsvExportError] = useState<string | null>(null);
  const activeControllersRef = useRef(new Set<AbortController>());
  const scopeKey = userId && loginGuard?.accountId === userId && isCurrentSession()
    ? JSON.stringify([loginGuard.accountId, loginGuard.serverSessionId, loginGuard.sessionEpoch, loginGuard.authFence, weekStart])
    : null;
  const items = itemsSnapshot?.scopeKey === scopeKey ? itemsSnapshot.items : null;
  const fallbackStorageKey = userId ? `fitfocus_data_${userId}_shopping_fallback_${weekStart}` : null;
  const fallbackChecked = fallbackStorageKey && fallbackCheckedSnapshot?.storageKey === fallbackStorageKey
    ? fallbackCheckedSnapshot.checked
    : EMPTY_FALLBACK_CHECKED;

  const requestScoped = useCallback(async (controller: AbortController, url: string, init: RequestInit) => {
    if (!loginGuard || !userId || loginGuard.accountId !== userId || !isCurrentSession()) {
      throw new Error('SHOPPING_SESSION_UNAVAILABLE');
    }
    activeControllersRef.current.add(controller);
    try {
      return await requestFamilyJson({ guard: loginGuard, controller, isCurrentSession }, url, init);
    } finally {
      activeControllersRef.current.delete(controller);
    }
  }, [isCurrentSession, loginGuard, userId]);

  useEffect(() => () => {
    for (const controller of activeControllersRef.current) controller.abort();
    activeControllersRef.current.clear();
  }, []);

  useEffect(() => {
    for (const controller of activeControllersRef.current) controller.abort();
    activeControllersRef.current.clear();
  }, [scopeKey]);

  useEffect(() => {
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) setPageGeneration((generation) => generation + 1);
    };
    window.addEventListener('pageshow', onPageShow);
    return () => window.removeEventListener('pageshow', onPageShow);
  }, []);

  useEffect(() => {
    try {
      if (!fallbackStorageKey) {
        setFallbackCheckedSnapshot(null);
        return;
      }
      const raw = localStorage.getItem(fallbackStorageKey);
      const parsed = raw ? parseJson(raw) : null;
      const checked = isRecord(parsed) && Object.values(parsed).every((value) => typeof value === "boolean")
        ? parsed as Record<string, boolean>
        : {};
      setFallbackCheckedSnapshot({ storageKey: fallbackStorageKey, checked });
    } catch {
      if (fallbackStorageKey) setFallbackCheckedSnapshot({ storageKey: fallbackStorageKey, checked: {} });
    }
  }, [fallbackStorageKey]);

  useEffect(() => {
    try {
      if (!fallbackStorageKey || fallbackCheckedSnapshot?.storageKey !== fallbackStorageKey) return;
      localStorage.setItem(fallbackStorageKey, JSON.stringify(fallbackCheckedSnapshot.checked));
    } catch {}
  }, [fallbackCheckedSnapshot, fallbackStorageKey]);

  useEffect(() => {
    if (!scopeKey || !loginGuard || !weekStart) return;
    const controller = new AbortController();
    let alive = true;
    (async () => {
      try {
        const { response, body } = await requestScoped(controller,
          `/api/shopping/list?week=${encodeURIComponent(weekStart)}`, { credentials: 'include' });
        if (!response.ok) throw new Error(`shopping_list_http_${response.status}`);
        if (!isRecord(body) || body.week_start !== weekStart || !Array.isArray(body.items)) {
          throw new Error('shopping_list_response_scope_invalid');
        }
        const normalized = body.items
          .map(normalizeShoppingItem)
          .filter((item): item is ShoppingItem => item !== null);
        await assertReadSession(loginGuard, { isCurrentSession, signal: controller.signal });
        if (!alive || !isCurrentSession()) return;
        setItemsSnapshot({ scopeKey, items: normalized });
      } catch {
        if (!alive || controller.signal.aborted) return;
        try {
          await assertReadSession(loginGuard, { isCurrentSession, signal: controller.signal });
        } catch {
          return;
        }
        if (!isCurrentSession()) return;
        setItemsSnapshot({ scopeKey, items: null });
      }
    })();
    return () => {
      alive = false;
      controller.abort();
    };
  }, [isCurrentSession, loginGuard, pageGeneration, requestScoped, scopeKey, weekStart]);

  const updateFallbackChecked = useCallback((
    updater: React.SetStateAction<Record<string, boolean>>,
  ) => {
    if (!fallbackStorageKey) return;
    setFallbackCheckedSnapshot((previous) => {
      const current = previous?.storageKey === fallbackStorageKey
        ? previous.checked
        : EMPTY_FALLBACK_CHECKED;
      const checked = typeof updater === 'function' ? updater(current) : updater;
      return { storageKey: fallbackStorageKey, checked };
    });
  }, [fallbackStorageKey]);

  const groups = useMemo(
    () => groupShoppingItemsByDepartment(items || [], { onlyUnchecked }),
    [items, onlyUnchecked],
  );

  const toggleChecked = useCallback(
    async (name: string, checked: boolean) => {
      const requestScopeKey = scopeKey;
      const requestGuard = loginGuard;
      const currentSession = isCurrentSession;
      if (!requestScopeKey || !requestGuard || requestGuard.accountId !== userId || !currentSession()) return;
      const updateItem = (nextChecked: boolean, onlyIfCurrentValue?: boolean) => {
        setItemsSnapshot((previous) => {
          if (previous?.scopeKey !== requestScopeKey || !previous.items) return previous;
          return {
            ...previous,
            items: previous.items.map((item) => item.name === name
              && (onlyIfCurrentValue === undefined || item.checked === onlyIfCurrentValue)
              ? { ...item, checked: nextChecked }
              : item),
          };
        });
      };
      updateItem(checked);
      const controller = new AbortController();
      try {
        const { response } = await requestScoped(controller, "/api/shopping/check", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ week_start: weekStart, ingredient_name: name, checked }),
        });
        if (!response.ok) throw new Error(`shopping_check_http_${response.status}`);
      } catch {
        if (controller.signal.aborted || !currentSession()) return;
        try {
          await assertReadSession(requestGuard, { isCurrentSession: currentSession, signal: controller.signal });
        } catch {
          return;
        }
        updateItem(!checked, checked);
      }
    },
    [isCurrentSession, loginGuard, requestScoped, scopeKey, userId, weekStart]
  );

  const copyText = useCallback(async () => {
    const lines: string[] = [];
    for (const g of groups) {
      lines.push(`${g.label}:`);
      for (const it of g.items) lines.push(`- ${it.name} — ${it.display_qty}`);
      lines.push("");
    }
    const text = lines.join("\n").trim() || (fallbackList || []).join("\n");
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore
    }
  }, [groups, fallbackList]);

  const exportCsv = useCallback(async () => {
    const capturedGuard = loginGuard;
    const capturedItems = items;
    const capturedSession = isCurrentSession;
    if (!scopeKey || !capturedGuard || capturedGuard.accountId !== userId || !capturedItems || !capturedSession()) return;
    setCsvExporting(true);
    setCsvExportError(null);
    try {
      await assertReadSession(capturedGuard, { isCurrentSession: capturedSession });
      const csv = buildPersonalShoppingCsv(capturedItems);
      await assertReadSession(capturedGuard, { isCurrentSession: capturedSession });
      const objectUrl = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `shopping_${weekStart}.csv`;
      link.hidden = true;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
    } catch {
      if (capturedSession()) setCsvExportError('Сессия изменилась. Обновите список и повторите экспорт.');
    } finally {
      setCsvExporting(false);
    }
  }, [isCurrentSession, items, loginGuard, scopeKey, userId, weekStart]);

  const fallbackParsed = useMemo(() => (fallbackList || []).map((row) => {
    const parts = String(row || '').split('—');
    return {
      name: (parts[0] || '').trim().replace(/^•\s*/, ''),
      qty: (parts.slice(1).join('—') || '').trim(),
      checked: false,
    };
  }).filter((it) => it.name), [fallbackList]);

  const fallbackGroups = useMemo(
    () => groupShoppingItemsByDepartment(
      fallbackParsed.map((it) => ({ ...it, checked: Boolean(fallbackChecked[it.name]) })),
      { onlyUnchecked },
    ),
    [fallbackChecked, fallbackParsed, onlyUnchecked],
  );

  const content =
    items && items.length ? (
      <div className="mt-3 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-slate-300 font-bold text-sm">
            <input
              type="checkbox"
              className="accent-slate-200"
              checked={onlyUnchecked}
              onChange={(e) => setOnlyUnchecked(e.target.checked)}
            />
            Только некупленное
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={copyText}
              className="px-3 py-2 rounded-xl bg-slate-900/40 border border-slate-800 text-slate-200 font-black text-xs hover:bg-slate-900/70"
            >
              Скопировать
            </button>
            <button
              type="button"
              onClick={() => void exportCsv()}
              disabled={csvExporting || !scopeKey}
              className="px-3 py-2 rounded-xl bg-slate-900/40 border border-slate-800 text-slate-200 font-black text-xs hover:bg-slate-900/70"
            >
              {csvExporting ? 'Подготовка…' : 'CSV'}
            </button>
          </div>
        </div>

        {csvExportError && <p role="status" className="text-xs text-amber-300">{csvExportError}</p>}

        {groups.map((g) => {
          const isCollapsed = Boolean(collapsed[g.department]);
          return (
            <div key={g.department} className="rounded-[1.5rem] bg-slate-950/40 border border-slate-800">
              <button
                onClick={() => setCollapsed((p) => ({ ...p, [g.department]: !p[g.department] }))}
                className="w-full flex items-center justify-between px-4 py-3"
              >
                <div>
                  <div className="text-slate-200 font-black text-sm">{g.label}</div>
                  <div className="text-slate-500 font-bold text-xs">
                    {onlyUnchecked
                      ? `${g.uncheckedCount} не куплено`
                      : `${g.uncheckedCount} не куплено · ${g.checkedCount} куплено`}
                  </div>
                </div>
                <div className="text-slate-500 font-black text-xs">{isCollapsed ? "Показать" : "Скрыть"}</div>
              </button>

              {!isCollapsed && (
                <div className="px-4 pb-4 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {g.items.map((it) => (
                      <label
                        key={it.name}
                        className={clsx(
                          "flex items-center justify-between gap-3 p-3 rounded-[1.2rem] border font-bold text-sm",
                          it.checked
                            ? "bg-slate-900/20 border-slate-800 text-slate-500 line-through"
                            : "bg-slate-950/30 border-slate-800 text-slate-200"
                        )}
                      >
                        <span className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            className="accent-slate-200"
                            checked={it.checked}
                            onChange={(e) => toggleChecked(it.name, e.target.checked)}
                          />
                          <span>{it.name}</span>
                        </span>
                        <span className="text-slate-300 font-black">{it.display_qty}</span>
                      </label>
                    ))}
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => setCollapsed((p) => ({ ...p, [g.department]: true }))}
                      className="px-3 py-2 rounded-xl bg-slate-900/40 border border-slate-800 text-slate-300 font-black text-xs hover:bg-slate-900/70 hover:border-indigo-500/30 hover:text-indigo-200 transition-all"
                    >
                      Свернуть
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    ) : (
      <div className="mt-3">
        {fallbackParsed.length ? (
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-slate-300 font-bold text-sm">
              <input
                type="checkbox"
                className="accent-slate-200"
                checked={onlyUnchecked}
                onChange={(e) => setOnlyUnchecked(e.target.checked)}
              />
              Только некупленное
            </label>
            <div className="space-y-3 text-sm font-bold text-slate-200">
              {fallbackGroups.map((group) => (
                <div key={group.department} className="rounded-[1.5rem] bg-slate-950/40 border border-slate-800">
                  <div className="px-4 py-3">
                    <div className="text-slate-200 font-black text-sm">{group.label}</div>
                    <div className="text-slate-500 font-bold text-xs">
                      {onlyUnchecked
                        ? `${group.uncheckedCount} не куплено`
                        : `${group.uncheckedCount} не куплено · ${group.checkedCount} куплено`}
                    </div>
                  </div>
                  <div className="px-4 pb-4 grid grid-cols-1 gap-2">
                    {group.items.map((it, i) => (
                      <label key={`${it.name}_${i}`} className={clsx(
                        "flex items-center justify-between gap-3 p-3 rounded-[1.2rem] border",
                        it.checked
                          ? "bg-slate-900/20 border-slate-800 text-slate-500 line-through"
                          : "bg-slate-950/30 border-slate-800 text-slate-200"
                      )}>
                        <span className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            className="accent-slate-200"
                            checked={it.checked}
                            onChange={(e) => updateFallbackChecked((prev) => ({ ...prev, [it.name]: e.target.checked }))}
                          />
                          <span>{it.name}</span>
                        </span>
                        {it.qty ? <span className="text-slate-300 font-black whitespace-nowrap">{it.qty}</span> : null}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="text-slate-500 font-bold text-sm">Пока нет списка покупок.</div>
        )}
      </div>
    );

  return (
    <div className="mt-4 p-4 rounded-[1.5rem] bg-slate-900/30 border border-slate-800">
      <div className="text-slate-200 font-black mb-1">{title}</div>
      <div className="text-slate-500 font-bold text-xs">Неделя с {weekStart}</div>
      {content}
    </div>
  );
}
