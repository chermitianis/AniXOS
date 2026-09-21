import { useTranslation } from "react-i18next";
import { Check, X, Sparkles, Crown, Rocket } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { BillingCycle } from "./BillingToggle";

export interface PlanFeature {
  label: string;
  included: boolean;
  highlight?: boolean;
}

export interface PlanDefinition {
  id: "trial" | "standard" | "premium";
  name: string;
  icon: LucideIcon;
  iconBg: string;
  priceMonthly: number;
  priceYearly: number;
  features: PlanFeature[];
  isCurrent?: boolean;
  isPopular?: boolean;
  ctaLabel: string;
  onCta: () => void;
  ctaDisabled?: boolean;
}

interface PlanCardProps {
  plan: PlanDefinition;
  billing: BillingCycle;
  currency: string;
}

export function PlanCard({ plan, billing, currency }: PlanCardProps) {
  const { t } = useTranslation();
  const Icon = plan.icon;

  const price = billing === "monthly" ? plan.priceMonthly : plan.priceYearly;
  const periodLabel = billing === "monthly" ? t("subscription.pricePerMonth") : t("subscription.pricePerYear");
  const showPriceAsZero = price === 0;

  return (
    <div
      className={`relative flex flex-col rounded-2xl border-2 bg-white p-6 transition-all hover:shadow-lg ${
        plan.isPopular
          ? "border-indigo-500 shadow-lg shadow-indigo-100"
          : plan.isCurrent
            ? "border-emerald-400"
            : "border-slate-200"
      }`}
    >
      {/* Badge "Populaire" ou "Actuel" */}
      {plan.isPopular && !plan.isCurrent && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-indigo-600 to-blue-600 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white shadow-md">
          ⭐ {t("subscription.popular")}
        </div>
      )}
      {plan.isCurrent && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-emerald-500 px-3 py-1 text-[10px] font-extrabold uppercase tracking-wider text-white shadow-md">
          {t("subscription.currentPlanBadge")}
        </div>
      )}

      {/* Header */}
      <div className="mb-5 flex items-center gap-3">
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${plan.iconBg}`}>
          <Icon size={22} />
        </div>
        <h3 className="text-lg font-extrabold text-slate-800">{plan.name}</h3>
      </div>

      {/* Prix */}
      <div className="mb-5">
        {showPriceAsZero ? (
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-extrabold text-slate-400">
              {t("subscription.priceOnRequest")}
            </span>
          </div>
        ) : (
          <div className="flex items-baseline gap-1.5">
            <span className="text-4xl font-extrabold tracking-tight text-slate-800" dir="ltr">
              {price.toFixed(2)}
            </span>
            <span className="text-sm font-bold text-slate-500">{currency}</span>
            <span className="text-xs font-medium text-slate-400">{periodLabel}</span>
          </div>
        )}
      </div>

      {/* Features */}
      <ul className="mb-6 flex flex-1 flex-col gap-2.5">
        {plan.features.map((feature, i) => (
          <li key={i} className="flex items-start gap-2 text-sm">
            {feature.included ? (
              <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${
                feature.highlight ? "bg-indigo-100 text-indigo-600" : "bg-emerald-100 text-emerald-600"
              }`}>
                <Check size={10} strokeWidth={3} />
              </span>
            ) : (
              <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-slate-100 text-slate-300">
                <X size={10} strokeWidth={3} />
              </span>
            )}
            <span className={feature.included ? "text-slate-600" : "text-slate-400 line-through"}>
              {feature.label}
            </span>
          </li>
        ))}
      </ul>

      {/* CTA */}
      <button
        type="button"
        onClick={plan.onCta}
        disabled={plan.ctaDisabled || plan.isCurrent}
        className={`w-full rounded-xl py-2.5 text-sm font-bold transition-all ${
          plan.isCurrent
            ? "cursor-default bg-emerald-50 text-emerald-600"
            : plan.ctaDisabled
              ? "cursor-not-allowed bg-slate-100 text-slate-400"
              : plan.isPopular
                ? "bg-gradient-to-br from-indigo-600 to-blue-600 text-white shadow-md shadow-indigo-200 hover:shadow-lg"
                : "bg-slate-800 text-white hover:bg-slate-700"
        }`}
      >
        {plan.ctaLabel}
      </button>
    </div>
  );
}

export const PLAN_ICONS = {
  trial: Sparkles,
  standard: Rocket,
  premium: Crown,
};