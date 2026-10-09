/**
 * ProgressBar — شريط تقدم ملوّن.
 * يُستخدم في KPI cards, OF tables, Projects list...
 *
 * @example
 * <ProgressBar value={75} color="blue" />
 * <ProgressBar value={42} color="orange" size="sm" showLabel />
 */

type ProgressColor = "blue" | "green" | "orange" | "purple" | "red" | "auto";
type ProgressSize = "xs" | "sm" | "md";

interface ProgressBarProps {
  /** القيمة من 0 إلى 100 */
  value: number;
  /** اللون — "auto" يعني: أخضر إذا < 80، برتقالي إذا < 100، أزرق إذا = 100 */
  color?: ProgressColor;
  /** حجم الشريط */
  size?: ProgressSize;
  /** عرض النسبة المئوية على اليمين */
  showLabel?: boolean;
  /** فئات إضافية */
  className?: string;
}

const COLOR_MAP: Record<Exclude<ProgressColor, "auto">, string> = {
  blue: "bg-blue-500",
  green: "bg-emerald-500",
  orange: "bg-amber-500",
  purple: "bg-violet-500",
  red: "bg-red-500",
};

const SIZE_MAP: Record<ProgressSize, string> = {
  xs: "h-1",
  sm: "h-1.5",
  md: "h-2",
};

function resolveColor(value: number, color: ProgressColor): Exclude<ProgressColor, "auto"> {
  if (color !== "auto") return color;
  if (value >= 100) return "blue";
  if (value >= 80) return "green";
  if (value >= 40) return "blue";
  if (value >= 20) return "orange";
  return "red";
}

export function ProgressBar({
  value,
  color = "auto",
  size = "sm",
  showLabel = false,
  className = "",
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const resolvedColor = resolveColor(clamped, color);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        className={`flex-1 overflow-hidden rounded-full bg-[var(--bg-muted)] ${SIZE_MAP[size]}`}
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`h-full rounded-full transition-all duration-300 ${COLOR_MAP[resolvedColor]}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      {showLabel && (
        <span
          className="w-10 shrink-0 text-end text-xs font-semibold tabular-nums text-[var(--text-secondary)]"
          dir="ltr"
        >
          {Math.round(clamped)}%
        </span>
      )}
    </div>
  );
}