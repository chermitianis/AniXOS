
import type { ReactNode, HTMLAttributes } from "react";

/**
 * Card — بطاقة موحّدة لكل المنصة.
 * تستخدم متغيرات design-tokens.css → تعمل تلقائياً في Light/Dark.
 *
 * @example
 * <Card>
 *   <CardHeader>
 *     <CardTitle>Titre</CardTitle>
 *     <CardAction>Voir tout →</CardAction>
 *   </CardHeader>
 *   <CardBody>Contenu</CardBody>
 * </Card>
 */

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  /** إضافة padding داخلي */
  padded?: boolean;
  /** تأثير hover (shadow أقوى) */
  interactive?: boolean;
}

export function Card({
  children,
  padded = false,
  interactive = false,
  className = "",
  ...rest
}: CardProps) {
  return (
    <div
      className={[
        "rounded-2xl border transition-all",
        "bg-[var(--bg-card)] border-[var(--border-subtle)]",
        "shadow-[var(--shadow-sm)]",
        interactive ? "hover:shadow-[var(--shadow-md)] cursor-pointer" : "",
        padded ? "p-5" : "",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      {...rest}
    >
      {children}
    </div>
  );
}

// ============================================================
// CardHeader — العنوان الرئيسي للبطاقة
// ============================================================
interface CardHeaderProps {
  children: ReactNode;
  className?: string;
}

export function CardHeader({ children, className = "" }: CardHeaderProps) {
  return (
    <div
      className={`flex items-center justify-between gap-3 px-5 pb-3 pt-5 ${className}`}
    >
      {children}
    </div>
  );
}

// ============================================================
// CardTitle — عنوان البطاقة
// ============================================================
interface CardTitleProps {
  children: ReactNode;
  /** حجم العنوان */
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function CardTitle({
  children,
  size = "md",
  className = "",
}: CardTitleProps) {
  const sizeClass =
    size === "sm"
      ? "text-sm font-bold"
      : size === "lg"
        ? "text-lg font-black"
        : "text-base font-bold";

  return (
    <h3
      className={`${sizeClass} tracking-tight text-[var(--text-primary)] ${className}`}
    >
      {children}
    </h3>
  );
}

// ============================================================
// CardAction — زر "Voir tout" على يمين العنوان
// ============================================================
interface CardActionProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}

export function CardAction({
  children,
  onClick,
  className = "",
}: CardActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 text-xs font-semibold text-[var(--accent-blue)] transition-colors hover:opacity-80 ${className}`}
    >
      {children}
    </button>
  );
}

// ============================================================
// CardBody — محتوى البطاقة
// ============================================================
interface CardBodyProps {
  children: ReactNode;
  className?: string;
}

export function CardBody({ children, className = "" }: CardBodyProps) {
  return <div className={`px-5 pb-5 ${className}`}>{children}</div>;
}

// ============================================================
// CardFooter — تذييل اختياري
// ============================================================
interface CardFooterProps {
  children: ReactNode;
  className?: string;
}

export function CardFooter({ children, className = "" }: CardFooterProps) {
  return (
    <div
      className={`border-t border-[var(--border-subtle)] px-5 py-3 ${className}`}
    >
      {children}
    </div>
  );
}
