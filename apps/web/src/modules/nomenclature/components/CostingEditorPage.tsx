import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft, Plus, CheckCircle2, Save, Loader2, Star, Package, DollarSign,
  TrendingUp, Clock,
} from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { OperationCard } from "../components/OperationCard";
import { MaterialCard } from "../components/MaterialCard";
import { STAGES, getStageDef } from "../lib/costingConstants";
import {
  listOperations, createOperation, updateOperation, deleteOperation,
  listMaterials, createMaterial, updateMaterial, deleteMaterial,
  type CostingOperation, type CostingMaterial,
} from "../api/costingApi";
import type { Nomenclature, PieceTask } from "../../../shared/types/database";

interface CostingEditorPageProps {
  nomenclature: Nomenclature;
  onBack: () => void;
}

interface PieceRow {
  id: string;
  name: string;
  estimated_time_minutes: number | null;
}

export function CostingEditorPage({ nomenclature, onBack }: CostingEditorPageProps) {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();

  const [operations, setOperations] = useState<CostingOperation[]>([]);
  const [materials, setMaterials] = useState<CostingMaterial[]>([]);
  const [pieces, setPieces] = useState<PieceRow[]>([]);
  const [activePieceId, setActivePieceId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ---------------------------------------------------------------------
  // Chargement
  // ---------------------------------------------------------------------
  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [ops, mats] = await Promise.all([
        listOperations(nomenclature.id),
        listMaterials(nomenclature.id),
      ]);
      setOperations(ops);
      setMaterials(mats);

      // Pièces du projet (si lié)
      if (nomenclature.project_id) {
        const { data } = await supabase
          .from("pieces_tasks")
          .select("id, name, estimated_time_minutes")
          .eq("project_id", nomenclature.project_id)
          .order("sequence_order");
        setPieces((data as PieceRow[]) ?? []);
      }

      // Pièce active par défaut = première
      if (ops.length > 0 && !activePieceId) {
        setActivePieceId(ops[0].piece_task_id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsLoading(false);
    }
  }, [nomenclature.id, nomenclature.project_id, activePieceId]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomenclature.id]);

  // ---------------------------------------------------------------------
  // Filtres actifs
  // ---------------------------------------------------------------------
  const activeOps = useMemo(
    () => (activePieceId ? operations.filter((o) => o.piece_task_id === activePieceId) : operations),
    [operations, activePieceId]
  );
  const activeMats = useMemo(
    () => (activePieceId ? materials.filter((m) => m.piece_task_id === activePieceId) : materials),
    [materials, activePieceId]
  );

  const totalOps = useMemo(() => activeOps.reduce((s, o) => s + o.subtotal, 0), [activeOps]);
  const totalMats = useMemo(() => activeMats.reduce((s, m) => s + m.subtotal, 0), [activeMats]);
  const grandTotal = totalOps + totalMats;
  const cncCost = useMemo(
    () => activeOps.filter((o) => o.stage === "usinage_cnc").reduce((s, o) => s + o.subtotal, 0),
    [activeOps]
  );
  const cncHours = useMemo(
    () => activeOps.filter((o) => o.stage === "usinage_cnc").reduce((s, o) => s + o.estimated_hours, 0),
    [activeOps]
  );

  // ---------------------------------------------------------------------
  // Actions — Operations
  // ---------------------------------------------------------------------
  async function handleAddOperation(stageKey: CostingOperation["stage"]) {
    if (!staffUser) return;
    const def = getStageDef(stageKey);
    const newOp = await createOperation({
      company_id: staffUser.company_id,
      nomenclature_id: nomenclature.id,
      piece_task_id: activePieceId,
      stage: stageKey,
      label: null,
      estimated_hours: 0,
      hourly_rate: def.defaultHourlyRate ?? 0,
      notes: null,
      sequence_order: activeOps.length,
    });
    setOperations((prev) => [...prev, newOp]);
  }

  async function handleUpdateOperation(id: string, patch: Partial<CostingOperation>) {
    setOperations((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o;
        const updated = { ...o, ...patch };
        updated.subtotal = (updated.estimated_hours || 0) * (updated.hourly_rate || 0);
        return updated;
      })
    );
    await updateOperation(id, patch);
  }

  async function handleDeleteOperation(id: string) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    await deleteOperation(id);
    setOperations((prev) => prev.filter((o) => o.id !== id));
  }

  // ---------------------------------------------------------------------
  // Actions — Materials
  // ---------------------------------------------------------------------
  async function handleAddMaterial() {
    if (!staffUser) return;
    const newMat = await createMaterial({
      company_id: staffUser.company_id,
      nomenclature_id: nomenclature.id,
      piece_task_id: activePieceId,
      material_name: "",
      material_code: null,
      quantity: 0,
      unit: "kg",
      unit_price: 0,
      notes: null,
      sequence_order: activeMats.length,
    });
    setMaterials((prev) => [...prev, newMat]);
  }

  async function handleUpdateMaterial(id: string, patch: Partial<CostingMaterial>) {
    setMaterials((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const updated = { ...m, ...patch };
        updated.subtotal = (updated.quantity || 0) * (updated.unit_price || 0);
        return updated;
      })
    );
    await updateMaterial(id, patch);
  }

  async function handleDeleteMaterial(id: string) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    await deleteMaterial(id);
    setMaterials((prev) => prev.filter((m) => m.id !== id));
  }

  // ---------------------------------------------------------------------
  // Sauvegarde globale
  // ---------------------------------------------------------------------
  async function handleSave() {
    setIsSaving(true);
    setError(null);
    try {
      // Mise à jour du total sur nomenclatures
      await supabase
        .from("nomenclatures")
        .update({ total_estimated_cost: grandTotal })
        .eq("id", nomenclature.id);

      // Sync pivot CNC → pieces_tasks (best-effort)
      if (activePieceId && cncHours > 0) {
        await supabase
          .from("pieces_tasks")
          .update({
            cnc_estimated_hours: cncHours,
            cnc_estimated_cost: cncCost,
            estimated_time_minutes: Math.round(cncHours * 60),
          } as never)
          .eq("id", activePieceId);
      }

      setLastSavedAt(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsSaving(false);
    }
  }

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Loader2 className="me-2 animate-spin" size={18} />
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-indigo-600 hover:text-indigo-700"
        >
          <ArrowLeft size={16} className="rtl:rotate-180" />
          {t("setup.backToList")}
        </button>
        <div className="flex items-center gap-2">
          <h2 className="min-w-0 truncate text-base font-extrabold text-slate-800 sm:text-lg">
            {nomenclature.name}
          </h2>
        </div>
      </div>

      {/* Sélecteur de pièce (si plusieurs) */}
      {pieces.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <label className="mb-1 block text-xs font-semibold text-slate-500">
            {t("costing.activePiece")}
          </label>
          <select
            value={activePieceId ?? ""}
            onChange={(e) => setActivePieceId(e.target.value || null)}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold focus:border-indigo-400 focus:outline-none"
          >
            {pieces.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* ============ OPÉRATIONS ============ */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
              <Clock size={16} />
            </div>
            <h3 className="text-base font-bold text-slate-800">{t("costing.operationsSection")}</h3>
          </div>
          <span className="text-sm font-bold text-indigo-700" dir="ltr">
            {totalOps.toFixed(2)} TND
          </span>
        </div>

        {/* Cartes */}
        <div className="space-y-2">
          {activeOps.map((op) => (
            <OperationCard
              key={op.id}
              operation={op}
              onChange={(patch) => void handleUpdateOperation(op.id, patch)}
              onDelete={() => void handleDeleteOperation(op.id)}
            />
          ))}
          {activeOps.length === 0 && (
            <p className="rounded-lg bg-slate-50 py-6 text-center text-sm text-slate-400">
              {t("costing.noOperations")}
            </p>
          )}
        </div>

        {/* Boutons d'ajout par étape */}
        <div className="mt-3 border-t border-slate-100 pt-3">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            {t("costing.addOperation")}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {STAGES.map((s) => (
              <button
                key={s.key}
                type="button"
                onClick={() => void handleAddOperation(s.key)}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 transition-colors hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700"
              >
                <span>{s.icon}</span>
                <span>{t(s.labelKey)}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ============ MATIÈRES ============ */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
              <Package size={16} />
            </div>
            <h3 className="text-base font-bold text-slate-800">{t("costing.materialsSection")}</h3>
          </div>
          <span className="text-sm font-bold text-amber-700" dir="ltr">
            {totalMats.toFixed(2)} TND
          </span>
        </div>

        <div className="space-y-2">
          {activeMats.map((m) => (
            <MaterialCard
              key={m.id}
              material={m}
              onChange={(patch) => void handleUpdateMaterial(m.id, patch)}
              onDelete={() => void handleDeleteMaterial(m.id)}
            />
          ))}
          {activeMats.length === 0 && (
            <p className="rounded-lg bg-slate-50 py-6 text-center text-sm text-slate-400">
              {t("costing.noMaterials")}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={() => void handleAddMaterial()}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg border-2 border-dashed border-amber-300 bg-amber-50/50 px-3 py-2 text-xs font-bold text-amber-700 transition-colors hover:border-amber-500 hover:bg-amber-50"
        >
          <Plus size={14} />
          {t("costing.addMaterial")}
        </button>
      </div>

      {/* ============ RÉCAP CNC ============ */}
      {cncHours > 0 && (
        <div className="rounded-xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 p-4">
          <div className="flex items-center gap-2">
            <Star size={16} className="text-amber-500" />
            <h3 className="text-sm font-bold text-amber-800">{t("costing.cncPivotTitle")}</h3>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <div className="text-[10px] uppercase text-amber-600">{t("costing.hours")}</div>
              <div className="text-base font-extrabold text-amber-800" dir="ltr">
                {cncHours.toFixed(2)} h
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-amber-600">{t("costing.subtotal")}</div>
              <div className="text-base font-extrabold text-amber-800" dir="ltr">
                {cncCost.toFixed(2)} TND
              </div>
            </div>
          </div>
          <p className="mt-2 text-[11px] text-amber-700">
            {t("costing.cncPivotHint")}
          </p>
        </div>
      )}

      {/* ============ TOTAL + ACTIONS ============ */}
      <div className="rounded-xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-blue-50 p-4 sm:p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-indigo-600">
              <TrendingUp size={14} />
              {t("costing.grandTotal")}
            </div>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-3xl font-extrabold text-indigo-900" dir="ltr">
                {grandTotal.toFixed(2)}
              </span>
              <span className="text-sm font-bold text-indigo-500">TND</span>
            </div>
            {lastSavedAt && (
              <p className="mt-1 text-[11px] text-slate-500">
                {t("costing.lastSavedAt")} : {lastSavedAt.toLocaleTimeString()}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => void handleSave()}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-slate-900 disabled:opacity-50"
            >
              {isSaving ? (
                <>
                  <Loader2 size={15} className="animate-spin" />
                  {t("common.saving")}
                </>
              ) : (
                <>
                  <Save size={15} />
                  {t("costing.saveEstimate")}
                </>
              )}
            </button>
            <button
              onClick={() => void handleSave()}
              disabled={isSaving}
              className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
            >
              <CheckCircle2 size={15} />
              {t("costing.validateEstimate")}
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}
    </div>
  );
}