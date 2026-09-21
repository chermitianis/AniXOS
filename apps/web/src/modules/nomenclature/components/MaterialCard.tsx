import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Trash2, Package, DollarSign } from "lucide-react";
import { MATERIAL_UNITS, MATERIAL_PRESETS, type MaterialUnit } from "../lib/costingConstants";
import type { CostingMaterial } from "../api/costingApi";

interface MaterialCardProps {
  material: CostingMaterial;
  onChange: (patch: Partial<CostingMaterial>) => void;
  onDelete: () => void;
}

export function MaterialCard({ material, onChange, onDelete }: MaterialCardProps) {
  const { t } = useTranslation();
  const [localName, setLocalName] = useState(material.material_name);
  const [localCode, setLocalCode] = useState(material.material_code ?? "");

  const subtotal = (material.quantity || 0) * (material.unit_price || 0);

  function handlePresetChange(presetName: string) {
    if (!presetName) return;
    const preset = MATERIAL_PRESETS.find((p) => p.name === presetName);
    if (!preset) return;
    setLocalName(preset.name);
    setLocalCode(preset.code);
    onChange({
      material_name: preset.name,
      material_code: preset.code,
      unit: preset.defaultUnit,
    });
  }

  return (
    <div className="rounded-xl border-2 border-slate-200 bg-slate-50/60 p-3 sm:p-4">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
            <Package size={15} />
          </div>
          <div className="min-w-0 flex-1">
            <input
              value={localName}
              onChange={(e) => setLocalName(e.target.value)}
              onBlur={() => onChange({ material_name: localName.trim() || "—" })}
              placeholder={t("costing.materialName")}
              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm font-bold text-slate-700 focus:border-indigo-400 focus:outline-none"
            />
          </div>
        </div>
        <button
          onClick={onDelete}
          className="shrink-0 rounded-lg p-1.5 text-red-500 hover:bg-red-50"
          aria-label={t("common.delete")}
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Preset + code */}
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {t("costing.materialPreset")}
          </label>
          <select
            value=""
            onChange={(e) => handlePresetChange(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs focus:border-indigo-400 focus:outline-none"
          >
            <option value="">— {t("costing.materialPresetChoose")} —</option>
            <optgroup label="Acier">
              {MATERIAL_PRESETS.filter((p) => p.category === "acier").map((p) => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </optgroup>
            <optgroup label="Aluminium">
              {MATERIAL_PRESETS.filter((p) => p.category === "alu").map((p) => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </optgroup>
            <optgroup label="Inox">
              {MATERIAL_PRESETS.filter((p) => p.category === "inox").map((p) => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </optgroup>
            <optgroup label="Laiton / Bronze">
              {MATERIAL_PRESETS.filter((p) => p.category === "laiton").map((p) => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </optgroup>
            <optgroup label="Fonte">
              {MATERIAL_PRESETS.filter((p) => p.category === "fonte").map((p) => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </optgroup>
            <optgroup label="Plastiques">
              {MATERIAL_PRESETS.filter((p) => p.category === "plastique").map((p) => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </optgroup>
            <optgroup label="Consommables">
              {MATERIAL_PRESETS.filter((p) => p.category === "consommable").map((p) => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </optgroup>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {t("costing.materialCode")}
          </label>
          <input
            value={localCode}
            onChange={(e) => setLocalCode(e.target.value)}
            onBlur={() => onChange({ material_code: localCode.trim() || null })}
            placeholder="—"
            dir="ltr"
            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 font-mono text-xs focus:border-indigo-400 focus:outline-none"
          />
        </div>
      </div>

      {/* Quantité + Unité + Prix + Sous-total */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {t("costing.quantity")}
          </label>
          <input
            type="number"
            min="0"
            step="0.1"
            value={material.quantity || ""}
            onChange={(e) => onChange({ quantity: Number(e.target.value) || 0 })}
            placeholder="0"
            dir="ltr"
            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center text-sm font-semibold focus:border-indigo-400 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {t("costing.unit")}
          </label>
          <select
            value={material.unit}
            onChange={(e) => onChange({ unit: e.target.value as MaterialUnit })}
            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm focus:border-indigo-400 focus:outline-none"
          >
            {MATERIAL_UNITS.map((u) => (
              <option key={u.key} value={u.key}>{u.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            <DollarSign size={9} /> {t("costing.unitPrice")}
          </label>
          <input
            type="number"
            min="0"
            step="0.001"
            value={material.unit_price || ""}
            onChange={(e) => onChange({ unit_price: Number(e.target.value) || 0 })}
            placeholder="0"
            dir="ltr"
            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center text-sm font-semibold focus:border-indigo-400 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {t("costing.subtotal")}
          </label>
          <div className="flex h-[34px] items-center justify-end rounded-lg border border-dashed border-indigo-300 bg-white px-2">
            <span className="text-sm font-extrabold text-indigo-700" dir="ltr">
              {subtotal.toFixed(2)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}