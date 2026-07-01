import React, { useEffect, useMemo, useState, useCallback } from "react";
import clsx from "clsx";
import { groupShoppingItemsByDepartment } from "./shoppingDepartments";

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
  return raw && typeof raw === "object" ? raw as ShoppingListPayloadItem : {};
}

function normalizeShoppingItem(raw: unknown): ShoppingItem | null {
  const item = asPayloadItem(raw);
  const name = String(item.name || item.ingredient_name || "").trim();
  if (!name) return null;
  const grams = Math.max(0, Math.round(Number(item.grams || 0)));
  return {
    name,
    grams,
    checked: Boolean(item.checked),
    display_qty: String(item.display_qty || item.displayQty || "").trim() || formatShoppingQty(grams),
  };
}

export default function ShoppingListCard({
  weekStart,
  title = "Список покупок",
  fallbackList,
  userId,
}: {
  weekStart: string;
  title?: string;
  fallbackList?: string[];
  userId?: string | null;
}) {
  const [items, setItems] = useState<ShoppingItem[] | null>(null);
  const [onlyUnchecked, setOnlyUnchecked] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [fallbackChecked, setFallbackChecked] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      if (!userId) {
        setFallbackChecked({});
        return;
      }
      const scopedKey = `fitfocus_data_${userId}_shopping_fallback_${weekStart}`;
      const raw = localStorage.getItem(scopedKey);
      setFallbackChecked(raw ? JSON.parse(raw) : {});
    } catch {
      setFallbackChecked({});
    }
  }, [userId, weekStart]);

  useEffect(() => {
    try {
      if (!userId) return;
      const scopedKey = `fitfocus_data_${userId}_shopping_fallback_${weekStart}`;
      localStorage.setItem(scopedKey, JSON.stringify(fallbackChecked));
    } catch {}
  }, [userId, weekStart, fallbackChecked]);

  const load = useCallback(async () => {
    if (!weekStart) return;
    const res = await fetch(`/api/shopping/list?week=${encodeURIComponent(weekStart)}`, { credentials: "include" });
    if (!res.ok) throw new Error(`shopping_list_http_${res.status}`);
    const data = await res.json();
    setItems((Array.isArray(data?.items) ? data.items : []).map(normalizeShoppingItem).filter(Boolean) as ShoppingItem[]);
  }, [weekStart]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await load();
      } catch {
        if (!alive) return;
        setItems(null);
      }
    })();
    return () => {
      alive = false;
    };
  }, [load]);

  const groups = useMemo(
    () => groupShoppingItemsByDepartment(items || [], { onlyUnchecked }),
    [items, onlyUnchecked],
  );

  const toggleChecked = useCallback(
    async (name: string, checked: boolean) => {
      // optimistic
      setItems((prev) =>
        (prev || []).map((it) => (it.name === name ? { ...it, checked } : it))
      );
      try {
        await fetch("/api/shopping/check", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ week_start: weekStart, ingredient_name: name, checked }),
        });
      } catch {
        // rollback on failure
        setItems((prev) =>
          (prev || []).map((it) => (it.name === name ? { ...it, checked: !checked } : it))
        );
      }
    },
    [weekStart]
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
            <a
              href={`/api/shopping/export?week=${encodeURIComponent(weekStart)}`}
              className="px-3 py-2 rounded-xl bg-slate-900/40 border border-slate-800 text-slate-200 font-black text-xs hover:bg-slate-900/70"
            >
              CSV
            </a>
          </div>
        </div>

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
                            onChange={(e) => setFallbackChecked((prev) => ({ ...prev, [it.name]: e.target.checked }))}
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
