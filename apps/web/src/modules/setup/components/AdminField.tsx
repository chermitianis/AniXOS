import type { ReactNode } from "react";

export function AdminField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="mb-3">
      <label className="mb-1 block text-sm font-semibold text-slate-600">{label}</label>
      {children}
    </div>
  );
}

export const adminInputClass = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm";
