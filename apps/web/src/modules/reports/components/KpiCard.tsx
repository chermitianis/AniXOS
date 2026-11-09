import type { LucideIcon } from "lucide-react";

type Trend = "up" | "down" | "neutral";

interface KpiCardProps {
  icon: LucideIcon;
  iconBg: string;
  label: string;
  value: string | number;
  changePercent?: number | null;
  subtitle?: string;
}

export function KpiCard({
  icon: Icon,
  iconBg,
  label,
  value,
  changePercent,
  subtitle,
}: KpiCardProps) {
  let trend: Trend = "neutral";
  if (typeof changePercent === "number" && !isNaN(changePercent)) {
    if (changePercent > 0.5) trend = "up";
    else if (changePercent < -0.5) trend = "down";
  }

  const trendColor =
    trend === "up"
      ? "text-emerald-600 dark:text-emerald-400"
      : trend === "down"
        ? "text-red-500 dark:text-red-400"
        : "text-slate-400 dark:text-slate-500";
  const trendSymbol = trend === "up" ? "▲" : trend === "down" ? "▼" : "";

  return (
    <div
      className="rounded-xl border p-3 shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow-md)] sm:p-4"
      style={{
        backgroundColor: "var(--bg-card)",
        borderColor: "var(--border-subtle)",
      }}
    >
      <div className="mb-2 flex items-start justify-between sm:mb-3">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg sm:h-9 sm:w-9 ${iconBg}`}>
          <Icon size={16} />
        </div>
      </div>
      <div
        className="truncate text-[10px] font-bold uppercase tracking-wide sm:text-[11px]"
        style={{ color: "var(--text-tertiary)" }}
      >
        {label}
      </div>
      <div
        className="mt-1 truncate text-xl font-extrabold sm:text-2xl"
        style={{ color: "var(--text-primary)" }}
        dir="ltr"
      >
        {value}
      </div>
      {(typeof changePercent === "number" || subtitle) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1 text-xs">
          {typeof changePercent === "number" && !isNaN(changePercent) && (
            <span className={`font-bold ${trendColor}`} dir="ltr">
              {trendSymbol} {Math.abs(changePercent).toFixed(1)}%
            </span>
          )}
          {subtitle && (
            <span className="truncate" style={{ color: "var(--text-tertiary)" }}>
              {subtitle}
            </span>
          )}
        </div>
      )}
    </div>
  );
}