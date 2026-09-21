import { useTranslation } from "react-i18next";
import { Calendar } from "lucide-react";
import type { DateRange, PeriodPreset } from "../types";
import { computeDateRange } from "../types";

interface PeriodSelectorProps {
  value: DateRange;
  onChange: (range: DateRange) => void;
}

const PRESETS: { key: PeriodPreset; labelKey: string }[] = [
  { key: "week_current", labelKey: "reports.periodWeekCurrent" },
  { key: "month_current", labelKey: "reports.periodMonthCurrent" },
  { key: "year_current", labelKey: "reports.periodYearCurrent" },
  { key: "last_7d", labelKey: "reports.periodLast7d" },
  { key: "last_30d", labelKey: "reports.periodLast30d" },
  { key: "last_365d", labelKey: "reports.periodLast365d" },
];

export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  const { t, i18n } = useTranslation();

  function handlePreset(preset: PeriodPreset) {
    onChange(computeDateRange(preset));
  }

  function handleCustomFrom(e: React.ChangeEvent<HTMLInputElement>) {
    const from = new Date(e.target.value);
    if (!isNaN(from.getTime())) {
      onChange({ from, to: value.to, preset: "custom" });
    }
  }

  function handleCustomTo(e: React.ChangeEvent<HTMLInputElement>) {
    const to = new Date(e.target.value);
    if (!isNaN(to.getTime())) {
      onChange({ from: value.from, to, preset: "custom" });
    }
  }

  const fmt = (d: Date) =>
    d.toLocaleDateString(i18n.language, { day: "2-digit", month: "2-digit", year: "numeric" });
  const toInputValue = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
      {/* Presets — scroll horizontal sur mobile */}
      <div className="-mx-1 flex gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1 px-1 sm:mx-0">
        {PRESETS.map((p) => {
          const active = value.preset === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => handlePreset(p.key)}
              className={`shrink-0 whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs font-semibold transition-colors sm:px-3 ${
                active
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-700"
              }`}
            >
              {t(p.labelKey)}
            </button>
          );
        })}
      </div>

      {/* Dates personnalisées */}
      <div className="flex items-center gap-1 self-start rounded-lg border border-slate-200 bg-white px-2 py-1 sm:self-auto">
        <Calendar size={14} className="shrink-0 text-slate-400" />
        <input
          type="date"
          value={toInputValue(value.from)}
          onChange={handleCustomFrom}
          className="min-w-0 border-0 bg-transparent text-xs text-slate-600 focus:outline-none"
          dir="ltr"
        />
        <span className="text-xs text-slate-300">→</span>
        <input
          type="date"
          value={toInputValue(value.to)}
          onChange={handleCustomTo}
          className="min-w-0 border-0 bg-transparent text-xs text-slate-600 focus:outline-none"
          dir="ltr"
        />
      </div>

      {/* Résumé texte — masqué sur mobile pour économiser l'espace */}
      <span className="hidden text-xs text-slate-400 sm:inline">
        {fmt(value.from)} → {fmt(value.to)}
      </span>
    </div>
  );
}