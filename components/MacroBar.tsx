import React from 'react';

export type MacroBarProps = {
  label: string;
  current: number;
  target: number;
  color: string;
  unit?: string;
};

const MacroBar: React.FC<MacroBarProps> = React.memo(({
  label,
  current,
  target,
  color,
  unit = 'г',
}) => {
  const progress = Math.min(100, (current / (target || 1)) * 100);

  return (
    <div className="space-y-2 text-left">
      <div className="flex justify-between text-[10px] font-bold uppercase tracking-wider">
        <span className="text-slate-500">{label}</span>
        <span className="text-slate-200 tabular-nums">{Math.round(current)} / {target} {unit}</span>
      </div>
      <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full transition-all duration-1000 ease-out rounded-full shadow-[0_0_8px_rgba(0,0,0,0.1)]"
          style={{ width: `${progress}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
});

export default MacroBar;
