import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Search, Loader2, Save, DollarSign, Package, AlertTriangle } from "lucide-react";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import {
  listMaterialPrices,
  upsertMaterialPrice,
  type MaterialPrice,
} from "../../nomenclature/api/costingApi";
import {
  MATERIALS,
  MATERIAL_CATEGORIES,
  type Material,
  type MaterialCategory,
} from "../../../shared/constants/materials";

// ----------------------------------------------------------------------------
// Page de gestion des prix matières par entreprise
// ----------------------------------------------------------------------------
export function MaterialPricesPage() {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();
  const companyId = staffUser?.company_id ?? null;

  const [prices, setPrices] = useState<Record<string, MaterialPrice>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSavingId, setIsSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);

  // Édition en mémoire : id → valeur temporaire
  const [edits, setEdits] = useState<Record<string, string>>({});

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<MaterialCategory | "">("");

  // -------------------------------------------------------------------------
  // Chargement
  // -------------------------------------------------------------------------
  const load = useCallback(async () => {
    if (!companyId) return;
    setIsLoading(true);
    setError(null);
    try {
      const list = await listMaterialPrices(companyId);
      const map: Record<string, MaterialPrice> = {};
      for (const p of list) map[p.material_id] = p;
      setPrices(map);
      setEdits({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  // -------------------------------------------------------------------------
  // Filtrage
  // -------------------------------------------------------------------------
  const filteredMaterials = useMemo(() => {
    const q = search.trim().toLowerCase();
    return MATERIALS.filter((m) => {
      if (categoryFilter && m.category !== categoryFilter) return false;
      if (q) {
        if (
          !m.label.toLowerCase().includes(q) &&
          !m.code.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [search, categoryFilter]);

  // -------------------------------------------------------------------------
  // Sauvegarde
  // -------------------------------------------------------------------------
  async function handleSave(material: Material) {
    if (!companyId) return;
    const raw = edits[material.id];
    if (raw === undefined) return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed) || parsed < 0) {
      setError(t("materialsPrice.invalidValue"));
      return;
    }

    setIsSavingId(material.id);
    setError(null);
    try {
      await upsertMaterialPrice(companyId, material.id, parsed);
      // Met à jour la map locale
      setPrices((prev) => ({
        ...prev,
        [material.id]: {
          ...(prev[material.id] ?? {
            id: "",
            company_id: companyId,
            material_id: material.id,
            currency: "TND",
            notes: null,
            created_at: "",
            updated_at: "",
          }),
          price_per_kg: parsed,
          updated_at: new Date().toISOString(),
        },
      }));
      // Retire l'édition locale
      setEdits((prev) => {
        const next = { ...prev };
        delete next[material.id];
        return next;
      });
      setSuccessId(material.id);
      setTimeout(() => setSuccessId(null), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsSavingId(null);
    }
  }

  function setLocalEdit(materialId: string, value: string) {
    setEdits((prev) => ({ ...prev, [materialId]: value }));
  }

  // -------------------------------------------------------------------------
  // Rendu
  // -------------------------------------------------------------------------
  const globalCount = Object.keys(prices).length;

  return (
    <div className="space-y-4">
      {/* En-tête */}
      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-extrabold text-slate-800">
              {t("materialsPrice.title")}
            </h1>
            <p className="mt-0.5 text-sm text-slate-500">
              {t("materialsPrice.subtitle")}
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2">
            <DollarSign size={16} className="text-indigo-600" />
            <span className="text-sm font-bold text-indigo-700">
              {globalCount} {t("materialsPrice.configured")}
            </span>
          </div>
        </div>
      </div>

      {/* Filtres */}
      <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <div className="relative">
            <Search
              size={16}
              className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400"
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("materialsPrice.searchPlaceholder")}
              className="w-full rounded-lg border border-slate-300 py-2 ps-9 pe-3 text-sm focus:border-indigo-400 focus:outline-none"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value as MaterialCategory | "")}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="">{t("materialsPrice.allCategories")}</option>
            {MATERIAL_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
          <div className="text-end text-xs text-slate-500 self-center">
            {filteredMaterials.length} / {MATERIALS.length}
          </div>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}

      {/* Tableau */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="me-2 animate-spin" size={18} />
          {t("common.loading")}
        </div>
      ) : filteredMaterials.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-400">
          <Package size={32} className="mx-auto mb-2 text-slate-300" />
          {t("materialsPrice.empty")}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2.5 text-start">{t("materialsPrice.colMaterial")}</th>
                <th className="px-3 py-2.5 text-start">{t("materialsPrice.colCategory")}</th>
                <th className="px-3 py-2.5 text-end">{t("materialsPrice.colDensity")}</th>
                <th className="px-3 py-2.5 text-end">{t("materialsPrice.colDefault")}</th>
                <th className="px-3 py-2.5 text-end">{t("materialsPrice.colCompany")}</th>
                <th className="w-20 px-3 py-2.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredMaterials.map((mat) => {
                const stored = prices[mat.id];
                const localValue =
                  edits[mat.id] !== undefined
                    ? edits[mat.id]
                    : stored
                      ? String(stored.price_per_kg)
                      : "";
                const isEditing = edits[mat.id] !== undefined;
                const isSaving = isSavingId === mat.id;
                const isSuccess = successId === mat.id;
                const categoryLabel =
                  MATERIAL_CATEGORIES.find((c) => c.key === mat.category)?.label ?? mat.category;

                return (
                  <tr key={mat.id} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2">
                      <div className="font-semibold text-slate-700">{mat.label}</div>
                      <div className="font-mono text-[10px] text-slate-400" dir="ltr">
                        {mat.code}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">
                      {categoryLabel}
                    </td>
                    <td className="px-3 py-2 text-end font-mono text-xs text-slate-500" dir="ltr">
                      {mat.density.toFixed(2)}
                    </td>
                    <td className="px-3 py-2 text-end font-mono text-xs text-slate-400" dir="ltr">
                      {mat.defaultPricePerKg ? mat.defaultPricePerKg.toFixed(2) : "—"}
                    </td>
                    <td className="px-3 py-2 text-end">
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={localValue}
                          onChange={(e) => setLocalEdit(mat.id, e.target.value)}
                          placeholder="0.00"
                          dir="ltr"
                          className={`w-24 rounded-lg border px-2 py-1 text-end text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-100 ${
                            isEditing
                              ? "border-indigo-400 bg-indigo-50/40 text-indigo-700"
                              : "border-slate-300 bg-white text-slate-700"
                          }`}
                        />
                        <span className="text-[10px] font-medium text-slate-400">TND/kg</span>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-end">
                      {isSuccess ? (
                        <span className="text-xs font-bold text-green-600">✓</span>
                      ) : (
                        <button
                          onClick={() => void handleSave(mat)}
                          disabled={!isEditing || isSaving}
                          className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-[11px] font-bold text-white transition-colors hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400"
                        >
                          {isSaving ? (
                            <Loader2 size={11} className="animate-spin" />
                          ) : (
                            <Save size={11} />
                          )}
                          {t("common.save")}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}