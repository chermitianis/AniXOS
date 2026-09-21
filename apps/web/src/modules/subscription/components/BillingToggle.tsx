import { useTranslation } from "react-i18next";

export type BillingCycle = "monthly" | "yearly";

interface BillingToggleProps {
  value: BillingCycle;
  onChange: (value: BillingCycle) => void;
  showDiscount?: boolean;
}

export function BillingToggle({ value, onChange, showDiscount = true }: BillingToggleProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
        <button
          type="button"
          onClick={() => onChange("monthly")}
          className={`rounded-lg px-5 py-2 text-sm font-bold transition-all ${
            value === "monthly"
              ? "bg-indigo-600 text-white shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          {t("subscription.monthlyLabel")}
        </button>
        <button
          type="button"
          onClick={() => onChange("yearly")}
          className={`relative rounded-lg px-5 py-2 text-sm font-bold transition-all ${
            value === "yearly"
              ? "bg-indigo-600 text-white shadow-sm"
              : "text-slate-500 hover:text-slate-700"
          }`}
        >
          {t("subscription.yearlyLabel")}
        </button>
      </div>
      {showDiscount && value === "yearly" && (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-700">
          {t("subscription.yearlyDiscount")}
        </span>
      )}
    </div>
  );
}