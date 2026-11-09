import type { ReactNode } from "react";

/**
 * Badge — شارة حالة (statut).
 * تُستخدم في: OF status, Machine status, Notifications, Tâches...
 *
 * @example
 * <Badge variant="success">En cours</Badge>
 * <Badge variant="warning" dot>En attente</Badge>
 */

type BadgeVariant =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "neutral"
  | "purple";

interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  /** نقطة ملوّنة على اليسار */
  dot?: boolean;
  /** حجم أصغر */
  size?: "sm" | "md";
  className?: string;
}

const VARIANT_MAP: Record<BadgeVariant, { bg: string; text: string; dot: string }> = {
  success: {
    bg: "bg-[var(--status-success-soft)]",
    text: "text-[var(--status-success)]",
    dot: "bg-[var(--status-success)]",
  },
  warning: {
    bg: "bg-[var(--status-warning-soft)]",
    text: "text-[var(--status-warning)]",
    dot: "bg-[var(--status-warning)]",
  },
  danger: {
    bg: "bg-[var(--status-danger-soft)]",
    text: "text-[var(--status-danger)]",
    dot: "bg-[var(--status-danger)]",
  },
  info: {
    bg: "bg-[var(--status-info-soft)]",
    text: "text-[var(--status-info)]",
    dot: "bg-[var(--status-info)]",
  },
  neutral: {
    bg: "bg-[var(--status-neutral-soft)]",
    text: "text-[var(--status-neutral)]",
    dot: "bg-[var(--status-neutral)]",
  },
  purple: {
    bg: "bg-[var(--accent-purple-soft)]",
    text: "text-[var(--accent-purple)]",
    dot: "bg-[var(--accent-purple)]",
  },
};

export function Badge({
  children,
  variant = "neutral",
  dot = false,
  size = "md",
  className = "",
}: BadgeProps) {
  const styles = VARIANT_MAP[variant];
  const sizeClass =
    size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-1 text-[11px]";

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-bold ${styles.bg} ${styles.text} ${sizeClass} ${className}`}
    >
      {dot && <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${styles.dot}`} />}
      {children}
    </span>
  );
}