import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Trash2, Clock, DollarSign, Star, Hash, Flame } from "lucide-react";
import {
  STAGES,
  getStageDef,
  getStageBilling,
  STT_TYPES,
  type CostingStage,
} from "../lib/costingConstants";
import type { CostingOperation } from "../api/costingApi";

interface OperationCardProps {
  operation: CostingOperation;
  onChange: (patch: Partial<CostingOperation>) => void;
  onDelete: () => void;
  /** Quantité de pièces du projet (utilisée pour STT / Anodisation). */
  pieceQuantity?: number;
}

const COLOR_MAP: Record<string, { bg: string; border: string; badge: string; text: string }> = {
  amber:   { bg: "bg-amber-50",   border: "border-amber-300",   badge: "bg-amber-100 text-amber-800",     text: "text-amber-700" },
  sky:     { bg: "bg-sky-50",     border: "border-sky-300",     badge: "bg-sky-100 text-sky-800",         text: "text-sky-700" },
  blue:    { bg: "bg-blue-50",    border: "border-blue-300",    badge: "bg-blue-100 text-blue-800",       text: "text-blue-700" },
  indigo:  { bg: "bg-indigo-50",  border: "border-indigo-300",  badge: "bg-indigo-100 text-indigo-800",   text: "text-indigo-700" },
  violet:  { bg: "bg-violet-50",  border: "border-violet-300",  badge: "bg-violet-100 text-violet-800",   text: "text-violet-700" },
  teal:    { bg: "bg-teal-50",    border: "border-teal-300",    badge: "bg-teal-100 text-teal-800",       text: "text-teal-700" },
  fuchsia: { bg: "bg-fuchsia-50", border: "border-fuchsia-300", badge: "bg-fuchsia-100 text-fuchsia-800", text: "text-fuchsia-700" },
  emerald: { bg: "bg-emerald-50", border: "border-emerald-300", badge: "bg-emerald-100 text-emerald-800", text: "text-emerald-700" },
  slate:   { bg: "bg-slate-50",   border: "border-slate-300",   badge: "bg-slate-100 text-slate-700",     text: "text-slate-600" },
};

const SELECTABLE_STAGES = STAGES.filter((s) => !s.deprecated);

export function OperationCard({
  operation,
  onChange,
  onDelete,
  pieceQuantity = 1,
}: OperationCardProps) {
  const { t } = useTranslation();
  const [localLabel, setLocalLabel] = useState(operation.label ?? "");

  const stage = getStageDef(operation.stage);
  const colors = COLOR_MAP[stage.color] ?? COLOR_MAP.slate;
  const billing = getStageBilling(operation.stage);
  const isPieceBilling = billing === "pieces";
  const isStt = operation.stage === "stt";

  // Calcul du sous-total
  const subtotal = isPieceBilling
    ? (operation.quantity_pieces || 0) * (operation.unit_price || 0)
    : (operation.estimated_hours || 0) * (operation.hourly_rate || 0);

  function handleStageChange(newStage: CostingStage) {
    const def = getStageDef(newStage);
    const newBilling = def.billing;

    const patch: Partial<CostingOperation> = { stage: newStage };

    if (newBilling === "pieces") {
      // Bascule vers facturation par pièce
      patch.quantity_pieces = operation.quantity_pieces || pieceQuantity || 1;
      patch.unit_price = operation.unit_price ?? def.defaultUnitPrice ?? 0;
      patch.estimated_hours = 0;
      patch.hourly_rate = 0;
    } else {
      // Bascule vers facturation par heure
      const currentDef = getStageDef(operation.stage);
      const newRate =
        operation.hourly_rate > 0 && operation.hourly_rate !== currentDef.defaultHourlyRate
          ? operation.hourly_rate
          : def.defaultHourlyRate ?? 0;
      patch.hourly_rate = newRate;
      patch.quantity_pieces = 1;
      patch.unit_price = null;
      patch.stt_type = null;
    }

    onChange(patch);
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
              {SELECTABLE_STAGES.map((s) => (
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
          {isPieceBilling && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-800 px-2 py-0.5 text-[10px] font-bold text-white">
              <Hash size={9} /> {t("costing.billingPieces")}
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

      {/* Type STT — seulement si stage = "stt" */}
      {isStt && (
        <div className="mb-3">
          <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            <Flame size={10} /> {t("costing.sttType")}
          </label>
          <select
            value={operation.stt_type ?? ""}
            onChange={(e) => onChange({ stt_type: e.target.value || null })}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
          >
            <option value="">— {t("costing.sttTypeChoose")} —</option>
            {STT_TYPES.map((s) => (
              <option key={s.key} value={s.key}>{s.label}</option>
            ))}
          </select>
        </div>
      )}

      {/* Label libre — seulement pour "autre" et "usinage_cnc/classique" */}
      {(operation.stage === "autre" ||
        operation.stage === "usinage_cnc" ||
        operation.stage === "usinage_classique") && (
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

      {/* Corps — 2 modes */}
      {isPieceBilling ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <div>
            <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <Hash size={10} /> {t("costing.quantityPieces")}
            </label>
            <input
              type="number"
              min="0"
              step="1"
              value={operation.quantity_pieces || ""}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isNaN(v) && v >= 0) onChange({ quantity_pieces: v });
              }}
              onBlur={(e) => {
                const v = Number(e.target.value);
                onChange({ quantity_pieces: Number.isFinite(v) ? v : 0 });
              }}
              placeholder={String(pieceQuantity)}
              dir="ltr"
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-center text-sm font-semibold focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-100"
            />
          </div>

          <div>
            <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <DollarSign size={10} /> {t("costing.unitPrice")}
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={operation.unit_price ?? ""}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isNaN(v) && v >= 0) onChange({ unit_price: v });
              }}
              onBlur={(e) => {
                const v = Number(e.target.value);
                onChange({ unit_price: Number.isFinite(v) ? v : 0 });
              }}
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
      ) : (
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
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isNaN(v) && v >= 0) onChange({ estimated_hours: v });
              }}
              onBlur={(e) => {
                const v = Number(e.target.value);
                onChange({ estimated_hours: Number.isFinite(v) ? v : 0 });
              }}
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
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isNaN(v) && v >= 0) onChange({ hourly_rate: v });
              }}
              onBlur={(e) => {
                const v = Number(e.target.value);
                onChange({ hourly_rate: Number.isFinite(v) ? v : 0 });
              }}
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
      )}
    </div>
  );
}