import type { ReactNode } from "react";

interface ChartCardProps {
  title: string;
  /** عنصر صغير يُعرض أعلى يمين البطاقة (فلتر، رابط View all، إلخ) */
  action?: ReactNode;
  children: ReactNode;
  /** ارتفاع ثابت للرسم (افتراضي 260px) */
  height?: number;
}

export function ChartCard({ title, action, children, height = 260 }: ChartCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-bold text-slate-700">{title}</h3>
        {action}
      </div>
      <div style={{ height }}>{children}</div>
    </div>
  );
}