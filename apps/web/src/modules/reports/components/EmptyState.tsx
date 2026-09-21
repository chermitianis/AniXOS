import { Inbox, type LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  message: string;
  hint?: string;
}

export function EmptyState({ icon: Icon = Inbox, message, hint }: EmptyStateProps) {
  return (
    <div className="flex h-full min-h-[180px] flex-col items-center justify-center text-center">
      <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Icon size={22} />
      </div>
      <p className="text-sm font-semibold text-slate-500">{message}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );
}