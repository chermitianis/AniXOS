import { Inbox, type LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  message: string;
  hint?: string;
}

export function EmptyState({ icon: Icon = Inbox, message, hint }: EmptyStateProps) {
  return (
    <div className="flex h-full min-h-[140px] flex-col items-center justify-center px-4 text-center sm:min-h-[180px]">
      <div
        className="mb-2 flex h-10 w-10 items-center justify-center rounded-full sm:h-12 sm:w-12"
        style={{
          backgroundColor: "var(--bg-muted)",
          color: "var(--text-tertiary)",
        }}
      >
        <Icon size={20} />
      </div>
      <p
        className="text-xs font-semibold sm:text-sm"
        style={{ color: "var(--text-secondary)" }}
      >
        {message}
      </p>
      {hint && (
        <p className="mt-1 text-[11px] sm:text-xs" style={{ color: "var(--text-tertiary)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}