import { Inbox, type LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  message: string;
  hint?: string;
}

export function EmptyState({ icon: Icon = Inbox, message, hint }: EmptyStateProps) {
  return (
    <div className="flex h-full min-h-[140px] flex-col items-center justify-center px-4 text-center sm:min-h-[180px]">
      <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400 sm:h-12 sm:w-12">
        <Icon size={20} />
      </div>
      <p className="text-xs font-semibold text-slate-500 sm:text-sm">{message}</p>
      {hint && <p className="mt-1 text-[11px] text-slate-400 sm:text-xs">{hint}</p>}
    </div>
  );
}