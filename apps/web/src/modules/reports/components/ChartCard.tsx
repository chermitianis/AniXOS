import type { ReactNode } from "react";

interface ChartCardProps {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  height?: number;
}

export function ChartCard({ title, action, children, height = 260 }: ChartCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="min-w-0 flex-1 truncate text-xs font-bold text-slate-700 sm:text-sm">
          {title}
        </h3>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {/* Hauteur responsive : plus courte sur mobile */}
      <div className="w-full" style={{ height: `${Math.min(height, 220)}px` }}>
        <div className="hidden sm:block" style={{ height }}>
          {children}
        </div>
        <div className="sm:hidden" style={{ height: Math.min(height, 220) }}>
          {children}
        </div>
      </div>
    </div>
  );
}