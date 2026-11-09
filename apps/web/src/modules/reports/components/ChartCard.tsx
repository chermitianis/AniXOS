import type { ReactNode } from "react";

interface ChartCardProps {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  height?: number;
}

export function ChartCard({ title, action, children, height = 260 }: ChartCardProps) {
  return (
    <div
      className="rounded-xl border p-3 shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow-md)] sm:p-4"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-subtle)",
      }}
    >
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3
          className="min-w-0 flex-1 truncate text-xs font-bold sm:text-sm"
          style={{ color: "var(--text-primary)" }}
        >
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