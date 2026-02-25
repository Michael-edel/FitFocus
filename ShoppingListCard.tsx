import React, { useEffect, useMemo, useState, useCallback } from "react";
import clsx from "clsx";

type Category = "vegetables" | "fruits" | "protein" | "dairy" | "carbs" | "fat" | "other";

const CATEGORY_LABEL: Record<Category, string> = {
  vegetables: "Овощи",
  fruits: "Фрукты",
  protein: "Белки",
  dairy: "Молочка",
  carbs: "Крупы / углеводы",
  fat: "Жиры / соусы",
  other: "Другое",
};

const CATEGORY_ORDER: Category[] = ["vegetables", "fruits", "dairy", "protein", "carbs", "fat", "other"];

type ShoppingItem = {
  name: string;
  grams: number;
  category: Category;
  checked: boolean;
  display_qty: string;
};

function groupItems(items: ShoppingItem[]) {
  const groups = new Map<Category, ShoppingItem[]>();
  for (const cat of CATEGORY_ORDER) groups.set(cat, []);
  for (const it of items) {
    const list = groups.get(it.category) || groups.get("other")!;
    list.push(it);
  }
  // drop empty groups
  return CATEGORY_ORDER
    .map((cat) => ({ category: cat, items: (groups.get(cat) || []).sort((a, b) => a.name.localeCompare(b.name, "ru")) }))
    .filter((g) => g.items.length > 0);
}

export default function ShoppingListCard({
  weekStart,
  title = "Список покупок",
  fallbackList,
}: {
  weekStart: string;
  title?: string;
  fallbackList?: string[];
}) {
  const [items, setItems] = useState<ShoppingItem[] | null>(null);
  const [onlyUnchecked, setOnlyUnchecked] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  const load = useCallback(async () => {
    if (!weekStart) return;
    const res = await fetch(`/api/shopping/list?week=${encodeURIComponent(weekStart)}`, { credentials: "include" });
    if (!res.ok) throw new Error(`shopping_list_http_${res.status}`);
    const data = await res.json();
    setItems(Array.isArray(data?.items) ? data.items : []);
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

  const visibleItems = useMemo(() => {
    const list = items || [];
    return onlyUnchecked ? list.filter((i) => !i.checked) : list;
  }, [items, onlyUnchecked]);

  const groups = useMemo(() => groupItems(visibleItems), [visibleItems]);

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
      lines.push(`${CATEGORY_LABEL[g.category]}:`);
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
          const isCollapsed = Boolean(collapsed[g.category]);
          return (
            <div key={g.category} className="rounded-[1.5rem] bg-slate-950/40 border border-slate-800">
              <button
                onClick={() => setCollapsed((p) => ({ ...p, [g.category]: !p[g.category] }))}
                className="w-full flex items-center justify-between px-4 py-3"
              >
                <div className="text-slate-200 font-black text-sm">{CATEGORY_LABEL[g.category]}</div>
                <div className="text-slate-500 font-black text-xs">{isCollapsed ? "Показать" : "Скрыть"}</div>
              </button>

              {!isCollapsed && (
                <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-2 gap-2">
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
              )}
            </div>
          );
        })}
      </div>
    ) : (
      <div className="mt-3">
        {fallbackList?.length ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm font-bold text-slate-200">
            {fallbackList.slice(0, 30).map((s, i) => (
              <div key={i} className="p-3 rounded-[1.2rem] bg-slate-950/40 border border-slate-800">
                • {s}
              </div>
            ))}
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
