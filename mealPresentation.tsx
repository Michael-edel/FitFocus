import React from 'react';

type MealPart = { name: string; qty?: string };

export const formatGramsPretty = (grams: number) => {
  const rounded = Math.max(0, Math.round(Number(grams || 0)));
  if (rounded >= 1000) return `${(rounded / 1000).toFixed(1)} кг`;
  return `${rounded} г`;
};

const parseMealParts = (text: string): MealPart[] => {
  const raw = String(text || '').trim();
  if (!raw) return [];

  const parts = raw
    .split(/\s*\+\s*|\s*;\s*/g)
    .map((part) => part.trim())
    .filter(Boolean);
  const pattern = /^(.+?)(?:\s*[—–-]\s*|\s*\()?(\d+(?:[\.,]\d+)?)\s*(кг|г|гр|мл|л|шт|порц|порции|порция)?\s*\)?\s*$/i;

  return parts.map((part) => {
    const match = part.match(pattern);
    if (!match) return { name: part };

    const name = (match[1] || '').trim();
    const amount = (match[2] || '').replace(',', '.').trim();
    const rawUnit = (match[3] || '').trim().toLowerCase();
    const unit = rawUnit === 'гр' ? 'г' : rawUnit;
    return { name: name || part, qty: unit ? `${amount} ${unit}` : amount };
  });
};

export function MealParts({ value }: { value: string }) {
  const parts = parseMealParts(value);
  const hasQuantity = parts.some((part) => Boolean(part.qty));
  const hasMultipleParts = parts.length > 1;

  if (!value) return <span className="text-slate-500">—</span>;
  if (!hasQuantity && !hasMultipleParts) return <span>{value}</span>;

  return (
    <div className="mt-1 space-y-1">
      {parts.map((part, index) => (
        <div key={index} className="flex items-start justify-between gap-3">
          <span className="text-slate-200">{part.name}</span>
          {part.qty ? <span className="text-slate-400 tabular-nums whitespace-nowrap">{part.qty}</span> : null}
        </div>
      ))}
    </div>
  );
}
