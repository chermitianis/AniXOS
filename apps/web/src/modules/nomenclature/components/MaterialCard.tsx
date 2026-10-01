import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Trash2, Package, DollarSign, Calculator, Weight } from "lucide-react";
import { MATERIAL_UNITS, type MaterialUnit } from "../lib/costingConstants";
import {
  MATERIALS,
  MATERIAL_CATEGORIES,
  findMaterial,
  type Material,
} from "../../../shared/constants/materials";
import {
  computeMaterialTotal,
  type CostingMaterial,
  type MaterialCalcMode,
} from "../api/costingApi";

interface MaterialCardProps {
  material: CostingMaterial;
  onChange: (patch: Partial<CostingMaterial>) => void;
  onDelete: () => void;
  /** Prix par kg configurés par l'entreprise (indexés par material_id). */
  companyPrices?: Record<string, number>;
}

const MODE_LABEL: Record<MaterialCalcMode, { key: string; icon: typeof Weight }> = {
  weight: { key: "costing.calcModeWeight", icon: Weight },
  rect:   { key: "costing.calcModeRect",   icon: Calculator },
  cyl:    { key: "costing.calcModeCyl",    icon: Calculator },
};

export function MaterialCard({
  material,
  onChange,
  onDelete,
  companyPrices = {},
}: MaterialCardProps) {
  const { t } = useTranslation();
  const [localName, setLocalName] = useState(material.material_name);
  const [localCode, setLocalCode] = useState(material.material_code ?? "");

  const mode: MaterialCalcMode = (material.calculation_mode as MaterialCalcMode) ?? "weight";

  // Résolution du prix : company > carte > défaut
  const pricePerKg = useMemo(() => {
    // 1) Prix saisi sur cette carte
    if (material.price_per_kg != null && material.price_per_kg > 0) {
      return material.price_per_kg;
    }
    // 2) Prix configuré par l'entreprise
    const byCompany = material.material_code
      ? companyPrices[material.material_code]
      : undefined;
    if (byCompany != null && byCompany > 0) return byCompany;
    // 3) Prix par défaut du catalogue
    const found = MATERIALS.find(
      (m) => m.code === material.material_code || m.label === material.material_name,
    );
    return found?.defaultPricePerKg ?? 0;
  }, [material.price_per_kg, material.material_code, material.material_name, companyPrices]);

  // Calculs dimensionnels
  const calc = useMemo(
    () =>
      computeMaterialTotal(
        mode,
        {
          length: material.length,
          width: material.width,
          thickness: material.thickness,
          diameter: material.diameter,
          massVolumique: material.mass_volumique,
          manualKg: material.quantity,
        },
        material.quantity_pieces || 1,
        pricePerKg,
      ),
    [mode, material, pricePerKg],
  );

  // Synchronise material_total dans la DB si changement
  // (délégué au parent via onChange — pas d'écriture ici)

  // Options par catégorie pour le <select>
  const groupedOptions = useMemo(() => {
    return MATERIAL_CATEGORIES.map((cat) => ({
      category: cat,
      items: MATERIALS.filter((m) => m.category === cat.key),
    })).filter((g) => g.items.length > 0);
  }, []);

  function handleMaterialSelect(materialId: string) {
    if (!materialId) return;
    const mat: Material | undefined = findMaterial(materialId);
    if (!mat) return;
    setLocalName(mat.label);
    setLocalCode(mat.code);
    onChange({
      material_name: mat.label,
      material_code: mat.code,
      unit: (mat.defaultUnit as MaterialUnit) ?? material.unit,
      mass_volumique: mat.density,
      price_per_kg: mat.defaultPricePerKg ?? material.price_per_kg ?? null,
    });
  }

  function handleModeChange(newMode: MaterialCalcMode) {
    onChange({ calculation_mode: newMode });
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

      {/* Catalogue + Code */}
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {t("costing.materialPreset")}
          </label>
          <select
            value=""
            onChange={(e) => handleMaterialSelect(e.target.value)}
            className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs focus:border-indigo-400 focus:outline-none"
          >
            <option value="">— {t("costing.materialPresetChoose")} —</option>
            {groupedOptions.map((group) => (
              <optgroup key={group.category.key} label={group.category.label}>
                {group.items.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </optgroup>
            ))}
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

      {/* Choix du mode de calcul */}
      <div className="mb-3">
        <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
          {t("costing.calcMode")}
        </label>
        <div className="grid grid-cols-3 gap-1">
          {(["weight", "rect", "cyl"] as MaterialCalcMode[]).map((m) => {
            const Icon = MODE_LABEL[m].icon;
            const active = mode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => handleModeChange(m)}
                className={`inline-flex items-center justify-center gap-1 rounded-lg border px-2 py-1.5 text-[11px] font-semibold transition-colors ${
                  active
                    ? "border-indigo-500 bg-indigo-50 text-indigo-700"
                    : "border-slate-200 bg-white text-slate-600 hover:border-indigo-300"
                }`}
              >
                <Icon size={11} />
                {t(MODE_LABEL[m].key)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Champs selon mode */}
      {mode === "weight" && (
        <div className="mb-3 grid grid-cols-3 gap-2">
          <div>
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              {t("costing.totalWeight")}
            </label>
            <input
              type="number"
              min="0"
              step="0.001"
              value={material.quantity || ""}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isNaN(v) && v >= 0) {
                  onChange({ quantity: v });
                }
              }}
              onBlur={(e) => {
                const v = Number(e.target.value);
                onChange({ quantity: Number.isFinite(v) ? v : 0 });
              }}
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
              <DollarSign size={9} /> {t("costing.pricePerKg")}
            </label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={material.price_per_kg ?? pricePerKg ?? ""}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!Number.isNaN(v) && v >= 0) onChange({ price_per_kg: v });
              }}
              onBlur={(e) => {
                const v = Number(e.target.value);
                onChange({ price_per_kg: Number.isFinite(v) ? v : 0 });
              }}
              placeholder="0"
              dir="ltr"
              className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center text-sm font-semibold focus:border-indigo-400 focus:outline-none"
            />
          </div>
        </div>
      )}

      {mode === "rect" && (
        <>
          <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {t("costing.dimLength")}
              </label>
              <input
                type="number" min="0" step="0.01"
                value={material.length ?? ""}
                onChange={(e) => onChange({ length: Number(e.target.value) || 0 })}
                dir="ltr"
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {t("costing.dimWidth")}
              </label>
              <input
                type="number" min="0" step="0.01"
                value={material.width ?? ""}
                onChange={(e) => onChange({ width: Number(e.target.value) || 0 })}
                dir="ltr"
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {t("costing.dimThickness")}
              </label>
              <input
                type="number" min="0" step="0.01"
                value={material.thickness ?? ""}
                onChange={(e) => onChange({ thickness: Number(e.target.value) || 0 })}
                dir="ltr"
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {t("costing.quantityPieces")}
              </label>
              <input
                type="number" min="1" step="1"
                value={material.quantity_pieces || 1}
                onChange={(e) => onChange({ quantity_pieces: Number(e.target.value) || 1 })}
                dir="ltr"
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center text-sm"
              />
            </div>
          </div>
          <div className="mb-3 grid grid-cols-3 gap-2">
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {t("costing.density")} (kg/dm³)
              </label>
              <input
                type="number" min="0" step="0.01"
                value={material.mass_volumique ?? ""}
                onChange={(e) => onChange({ mass_volumique: Number(e.target.value) || 0 })}
                dir="ltr"
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center text-sm"
              />
            </div>
            <div>
              <label className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <DollarSign size={9} /> {t("costing.pricePerKg")}
              </label>
              <input
                type="number" min="0" step="0.01"
                value={material.price_per_kg ?? pricePerKg ?? ""}
                onChange={(e) => onChange({ price_per_kg: Number(e.target.value) || 0 })}
                dir="ltr"
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {t("costing.materialTotal")}
              </label>
              <div className="flex h-[34px] items-center justify-end rounded-lg border border-dashed border-indigo-300 bg-white px-2">
                <span className="text-sm font-extrabold text-indigo-700" dir="ltr">
                  {calc.total.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {mode === "cyl" && (
        <>
          <div className="mb-3 grid grid-cols-3 gap-2">
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {t("costing.dimDiameter")} (Ø mm)
              </label>
              <input
                type="number" min="0" step="0.01"
                value={material.diameter ?? ""}
                onChange={(e) => onChange({ diameter: Number(e.target.value) || 0 })}
                dir="ltr"
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {t("costing.dimLength")}
              </label>
              <input
                type="number" min="0" step="0.01"
                value={material.length ?? ""}
                onChange={(e) => onChange({ length: Number(e.target.value) || 0 })}
                dir="ltr"
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {t("costing.quantityPieces")}
              </label>
              <input
                type="number" min="1" step="1"
                value={material.quantity_pieces || 1}
                onChange={(e) => onChange({ quantity_pieces: Number(e.target.value) || 1 })}
                dir="ltr"
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center text-sm"
              />
            </div>
          </div>
          <div className="mb-3 grid grid-cols-3 gap-2">
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {t("costing.density")} (kg/dm³)
              </label>
              <input
                type="number" min="0" step="0.01"
                value={material.mass_volumique ?? ""}
                onChange={(e) => onChange({ mass_volumique: Number(e.target.value) || 0 })}
                dir="ltr"
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center text-sm"
              />
            </div>
            <div>
              <label className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <DollarSign size={9} /> {t("costing.pricePerKg")}
              </label>
              <input
                type="number" min="0" step="0.01"
                value={material.price_per_kg ?? pricePerKg ?? ""}
                onChange={(e) => onChange({ price_per_kg: Number(e.target.value) || 0 })}
                dir="ltr"
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-center text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                {t("costing.materialTotal")}
              </label>
              <div className="flex h-[34px] items-center justify-end rounded-lg border border-dashed border-indigo-300 bg-white px-2">
                <span className="text-sm font-extrabold text-indigo-700" dir="ltr">
                  {calc.total.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Bandeau récapitulatif */}
      {mode !== "weight" && (
        <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] text-slate-600">
          <span className="font-semibold">{t("costing.weightPerPiece")} :</span>{" "}
          <span dir="ltr" className="font-mono">
            {calc.weightPerPiece.toFixed(3)} kg
          </span>
          <span className="mx-2 text-slate-300">·</span>
          <span className="font-semibold">{t("costing.totalWeight")} :</span>{" "}
          <span dir="ltr" className="font-mono">
            {calc.totalWeight.toFixed(3)} kg
          </span>
          <span className="mx-2 text-slate-300">·</span>
          <span className="font-semibold">{t("costing.materialTotal")} :</span>{" "}
          <span dir="ltr" className="font-mono font-bold text-indigo-700">
            {calc.total.toFixed(2)} TND
          </span>
        </div>
      )}
    </div>
  );
}