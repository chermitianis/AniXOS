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
    trend === "up" ? "text-emerald-600" : trend === "down" ? "text-red-500" : "text-slate-400";
  const trendSymbol = trend === "up" ? "▲" : trend === "down" ? "▼" : "";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
      <div className="mb-2 flex items-start justify-between sm:mb-3">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg sm:h-9 sm:w-9 ${iconBg}`}>
          <Icon size={16} />
        </div>
      </div>
      <div className="truncate text-[10px] font-bold uppercase tracking-wide text-slate-400 sm:text-[11px]">
        {label}
      </div>
      <div className="mt-1 truncate text-xl font-extrabold text-slate-800 sm:text-2xl" dir="ltr">
        {value}
      </div>
      {(typeof changePercent === "number" || subtitle) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1 text-xs">
          {typeof changePercent === "number" && !isNaN(changePercent) && (
            <span className={`font-bold ${trendColor}`} dir="ltr">
              {trendSymbol} {Math.abs(changePercent).toFixed(1)}%
            </span>
          )}
          {subtitle && <span className="truncate text-slate-400">{subtitle}</span>}
        </div>
      )}
    </div>
  );
}