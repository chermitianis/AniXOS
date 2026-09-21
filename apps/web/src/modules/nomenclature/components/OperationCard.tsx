import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Trash2, Clock, DollarSign, Star } from "lucide-react";
import { STAGES, getStageDef, type CostingStage } from "../lib/costingConstants";
import type { CostingOperation } from "../api/costingApi";

interface OperationCardProps {
  operation: CostingOperation;
  onChange: (patch: Partial<CostingOperation>) => void;
  onDelete: () => void;
}

const COLOR_MAP: Record<string, { bg: string; border: string; badge: string; text: string }> = {
  amber:   { bg: "bg-amber-50",   border: "border-amber-300",   badge: "bg-amber-100 text-amber-800",   text: "text-amber-700" },
  sky:     { bg: "bg-sky-50",     border: "border-sky-300",     badge: "bg-sky-100 text-sky-800",       text: "text-sky-700" },
  blue:    { bg: "bg-blue-50",    border: "border-blue-300",    badge: "bg-blue-100 text-blue-800",     text: "text-blue-700" },
  indigo:  { bg: "bg-indigo-50",  border: "border-indigo-300",  badge: "bg-indigo-100 text-indigo-800", text: "text-indigo-700" },
  violet:  { bg: "bg-violet-50",  border: "border-violet-300",  badge: "bg-violet-100 text-violet-800", text: "text-violet-700" },
  teal:    { bg: "bg-teal-50",    border: "border-teal-300",    badge: "bg-teal-100 text-teal-800",     text: "text-teal-700" },
  fuchsia: { bg: "bg-fuchsia-50", border: "border-fuchsia-300", badge: "bg-fuchsia-100 text-fuchsia-800", text: "text-fuchsia-700" },
  emerald: { bg: "bg-emerald-50", border: "border-emerald-300", badge: "bg-emerald-100 text-emerald-800", text: "text-emerald-700" },
  slate:   { bg: "bg-slate-50",   border: "border-slate-300",   badge: "bg-slate-100 text-slate-700",   text: "text-slate-600" },
};

export function OperationCard({ operation, onChange, onDelete }: OperationCardProps) {
  const { t } = useTranslation();
  const [localLabel, setLocalLabel] = useState(operation.label ?? "");
  const stage = getStageDef(operation.stage);
  const colors = COLOR_MAP[stage.color] ?? COLOR_MAP.slate;
  const subtotal = (operation.estimated_hours || 0) * (operation.hourly_rate || 0);

  function handleStageChange(newStage: CostingStage) {
    const def = getStageDef(newStage);
    onChange({
      stage: newStage,
      hourly_rate: operation.hourly_rate || def.defaultHourlyRate || 0,
    });
  }

  return (
    <div className={`rounded-xl border-2 ${colors.border} ${colors.bg} p-3 sm:p-4`}>
      {/* Header */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="text-lg shrink-0">{stage.icon}</span>
          <div className="min-w-0 flex-1">
            <select
              value={operation.stage}
              onChange={(e) => handleStageChange(e.target.value as CostingStage)}
              className={`w-full truncate rounded-lg border-0 bg-transparent text-sm font-bold ${colors.text} focus:outline-none`}
            >
              {STAGES.map((s) => (
                <option key={s.key} value={s.key}>
                  {t(s.labelKey)}
                </option>
              ))}
            </select>
          </div>
          {stage.isPivot && (
            <span className={`inline-flex shrink-0 items-center gap-1 rounded-full ${colors.badge} px-2 py-0.5 text-[10px] font-bold`}>
              <Star size={9} /> {t("costing.pivotBadge")}
            </span>
          )}
        </div>
        <button
          onClick={onDelete}
          className="shrink-0 rounded-lg p-1.5 text-red-500 hover:bg-red-50"
          aria-label={t("common.delete")}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Label libre — affiché uniquement si stage='autre' */}
      {operation.stage === "autre" && (
        <div className="mb-3">
          <input
            value={localLabel}
            onChange={(e) => setLocalLabel(e.target.value)}
            onBlur={() => onChange({ label: localLabel.trim() || null })}
            placeholder={t("costing.customLabelPlaceholder")}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>
      )}

      {/* Champs */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <div>
          <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <Clock size={10} /> {t("costing.hours")}
          </label>
          <input
            type="number"
            min="0"
            step="0.25"
            value={operation.estimated_hours || ""}
            onChange={(e) => onChange({ estimated_hours: Number(e.target.value) || 0 })}
            placeholder="0"
            dir="ltr"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-center text-sm font-semibold focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        <div>
          <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <DollarSign size={10} /> {t("costing.hourlyRate")}
          </label>
          <input
            type="number"
            min="0"
            step="0.5"
            value={operation.hourly_rate || ""}
            onChange={(e) => onChange({ hourly_rate: Number(e.target.value) || 0 })}
            placeholder="0"
            dir="ltr"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-center text-sm font-semibold focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          />
        </div>

        <div className="col-span-2 sm:col-span-1">
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {t("costing.subtotal")}
          </label>
          <div className={`flex h-[34px] items-center justify-end rounded-lg border border-dashed ${colors.border} bg-white px-3`}>
            <span className={`text-sm font-extrabold ${colors.text}`} dir="ltr">
              {subtotal.toFixed(2)}
            </span>
            <span className="ms-1 text-[10px] text-slate-400">TND</span>
          </div>
        </div>
      </div>
    </div>
  );
}