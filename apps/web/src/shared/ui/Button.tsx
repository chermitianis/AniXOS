import type { ButtonHTMLAttributes, ReactNode } from "react";

/**
 * Button — زر موحّد لكل المنصة.
 *
 * @example
 * <Button variant="primary" onClick={...}>Enregistrer</Button>
 * <Button variant="ghost" size="sm">Annuler</Button>
 * <Button variant="outline">Voir tout</Button>
 */

type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  | "accent";

type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** أيقونة على اليسار */
  icon?: ReactNode;
  /** أيقونة على اليمين */
  iconRight?: ReactNode;
  /** يمتد على العرض الكامل */
  fullWidth?: boolean;
}

const VARIANT_MAP: Record<ButtonVariant, string> = {
  primary:
    "bg-[var(--brand-orange)] text-white hover:bg-[var(--brand-orange-hover)] shadow-sm",
  accent:
    "bg-[var(--accent-blue)] text-white hover:bg-blue-600 shadow-sm",
  secondary:
    "bg-[var(--text-primary)] text-[var(--text-inverse)] hover:opacity-90 shadow-sm",
  outline:
    "border border-[var(--border-strong)] bg-transparent text-[var(--text-primary)] hover:bg-[var(--bg-hover)]",
  ghost:
    "bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-primary)]",
  danger:
    "bg-[var(--status-danger)] text-white hover:bg-red-600 shadow-sm",
};

const SIZE_MAP: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

export function Button({
  children,
  variant = "primary",
  size = "md",
  icon,
  iconRight,
  fullWidth = false,
  className = "",
  disabled,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      className={[
        "inline-flex items-center justify-center rounded-xl font-bold transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--border-focus)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg-app)]",
        "disabled:cursor-not-allowed disabled:opacity-50",
        VARIANT_MAP[variant],
        SIZE_MAP[size],
        fullWidth ? "w-full" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {icon && <span className="shrink-0">{icon}</span>}
      <span className="truncate">{children}</span>
      {iconRight && <span className="shrink-0">{iconRight}</span>}
    </button>
  );
}