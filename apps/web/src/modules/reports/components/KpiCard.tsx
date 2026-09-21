import type { LucideIcon } from "lucide-react";

type Trend = "up" | "down" | "neutral";

interface KpiCardProps {
  icon: LucideIcon;
  /** لون الأيقونة (Tailwind classes) — مثال: "bg-indigo-100 text-indigo-600" */
  iconBg: string;
  label: string;
  value: string | number;
  /** نسبة التغيير (اختياري) — مثال: 12.5 لـ +12.5% */
  changePercent?: number | null;
  /** نص صغير تحت القيمة — مثال: "vs mois dernier" */
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
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-start justify-between">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${iconBg}`}>
          <Icon size={18} />
        </div>
      </div>
      <div className="text-[11px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-1 text-2xl font-extrabold text-slate-800" dir="ltr">
        {value}
      </div>
      {(typeof changePercent === "number" || subtitle) && (
        <div className="mt-1.5 flex items-center gap-1 text-xs">
          {typeof changePercent === "number" && !isNaN(changePercent) && (
            <span className={`font-bold ${trendColor}`} dir="ltr">
              {trendSymbol} {Math.abs(changePercent).toFixed(1)}%
            </span>
          )}
          {subtitle && <span className="text-slate-400">{subtitle}</span>}
        </div>
      )}
    </div>
  );
}