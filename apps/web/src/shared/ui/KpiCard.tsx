import type { ReactNode } from "react";
import { TrendingUp, TrendingDown } from "lucide-react";
import { ProgressBar } from "./ProgressBar";

/**
 * KpiCard — بطاقة إحصائية للـDashboard.
 * تُستخدم في ManagerDashboardPage: Machines en production, OF, Opérateurs...
 *
 * @example
 * <KpiCard
 *   icon={<Monitor size={20} />}
 *   iconColor="blue"
 *   label="Machines en production"
 *   value="3"
 *   total="4"
 *   trend={{ direction: "up", value: "+9.01%" }}
 *   progress={75}
 * />
 */

type KpiColor = "blue" | "green" | "orange" | "purple" | "red";

interface KpiTrend {
  direction: "up" | "down";
  value: string;
}

interface KpiCardProps {
  /** الأيقونة */
  icon: ReactNode;
  /** لون الأيقونة */
  iconColor?: KpiColor;
  /** التسمية (فوق الرقم) */
  label: string;
  /** القيمة الرئيسية */
  value: string | number;
  /** القيمة الإجمالية (اختياري: يُعرض "value / total") */
  total?: string | number;
  /** مؤشر التrend */
  trend?: KpiTrend;
  /** شريط تقدم من 0 إلى 100 */
  progress?: number;
  /** نسبة الشريط */
  progressColor?: "auto" | KpiColor;
  /** نص صغير أسفل (مثل "En cours", "Taux") */
  caption?: string;
  className?: string;
}

const ICON_COLOR_MAP: Record<KpiColor, { bg: string; text: string }> = {
  blue: { bg: "bg-[var(--accent-blue-soft)]", text: "text-[var(--accent-blue)]" },
  green: { bg: "bg-[var(--accent-green-soft)]", text: "text-[var(--accent-green)]" },
  orange: { bg: "bg-[var(--accent-orange-soft)]", text: "text-[var(--accent-orange)]" },
  purple: { bg: "bg-[var(--accent-purple-soft)]", text: "text-[var(--accent-purple)]" },
  red: { bg: "bg-[var(--accent-red-soft)]", text: "text-[var(--accent-red)]" },
};

export function KpiCard({
  icon,
  iconColor = "blue",
  label,
  value,
  total,
  trend,
  progress,
  progressColor = "auto",
  caption,
  className = "",
}: KpiCardProps) {
  const iconStyles = ICON_COLOR_MAP[iconColor];

  return (
    <div
      className={`rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-sm)] transition-shadow hover:shadow-[var(--shadow-md)] ${className}`}
    >
      {/* Header: icon + label */}
      <div className="mb-4 flex items-center gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${iconStyles.bg} ${iconStyles.text}`}
        >
          {icon}
        </div>
        <span className="text-sm font-semibold text-[var(--text-secondary)]">
          {label}
        </span>
      </div>

      {/* Value */}
      <div className="mb-1 flex items-baseline gap-2">
        <span
          className="text-3xl font-black tracking-tight text-[var(--text-primary)] tabular-nums"
          dir="ltr"
        >
          {value}
        </span>
        {total !== undefined && (
          <span className="text-lg font-bold text-[var(--text-tertiary)]" dir="ltr">
            / {total}
          </span>
        )}
      </div>

      {/* Trend / Caption */}
      {(trend || caption) && (
        <div className="mb-3 flex items-center gap-2 text-xs">
          {trend && (
            <span
              className={`inline-flex items-center gap-1 font-bold ${
                trend.direction === "up"
                  ? "text-[var(--status-success)]"
                  : "text-[var(--status-danger)]"
              }`}
            >
              {trend.direction === "up" ? (
                <TrendingUp size={12} />
              ) : (
                <TrendingDown size={12} />
              )}
              {trend.value}
            </span>
          )}
          {caption && (
            <span className="font-semibold text-[var(--text-tertiary)]">
              {caption}
            </span>
          )}
        </div>
      )}

      {/* Progress bar */}
      {progress !== undefined && (
        <ProgressBar
          value={progress}
          color={progressColor === "auto" ? "auto" : progressColor}
          size="sm"
          showLabel
        />
      )}
    </div>
  );
}