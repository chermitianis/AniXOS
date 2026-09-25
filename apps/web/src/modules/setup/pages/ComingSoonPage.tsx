import { useTranslation } from "react-i18next";
import { Construction } from "lucide-react";

interface ComingSoonPageProps {
  title: string;
}

export function ComingSoonPage({ title }: ComingSoonPageProps) {
  const { t } = useTranslation();

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
        <Construction size={26} />
      </div>
      <h2 className="text-base font-bold text-slate-800">{title}</h2>
      <p className="mt-2 max-w-md text-sm text-slate-500">
        {t("common.comingSoonBody")}
      </p>
      <span className="mt-5 inline-flex items-center rounded-full bg-slate-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">
        {t("common.comingSoon")}
      </span>
    </div>
  );
}