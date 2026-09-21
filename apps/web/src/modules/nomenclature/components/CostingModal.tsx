import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  X, Plus, Loader2, Save, CheckCircle2, Star, Package, Clock, TrendingUp,
} from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { OperationCard } from "./OperationCard";
import { MaterialCard } from "./MaterialCard";
import { STAGES, getStageDef } from "../lib/costingConstants";
import {
  listOperations, createOperation, updateOperation, deleteOperation,
  listMaterials, createMaterial, updateMaterial, deleteMaterial,
  type CostingOperation, type CostingMaterial,
} from "../api/costingApi";

interface CostingModalProps {
  pieceIds: string[];
  onClose: () => void;
  onSaved: () => void;
}

export function CostingModal({ pieceIds, onClose, onSaved }: CostingModalProps) {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();

  const [nomenclatureId, setNomenclatureId] = useState<string | null>(null);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [pieces, setPieces] = useState<{ id: string; name: string }[]>([]);
  const [activePieceId, setActivePieceId] = useState<string | null>(null);
  const [operations, setOperations] = useState<CostingOperation[]>([]);
  const [materials, setMaterials] = useState<CostingMaterial[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!staffUser || pieceIds.length === 0) return;
    setIsLoading(true);
    setError(null);
    try {
      // 1) Récupérer les pièces
      const { data: piecesData, error: piecesErr } = await supabase
        .from("pieces_tasks")
        .select("id, name, project_id")
        .in("id", pieceIds);
      if (piecesErr) throw piecesErr;
      const pieceList = (piecesData ?? []) as { id: string; name: string; project_id: string }[];
      if (pieceList.length === 0) throw new Error("no_pieces");

      const projectIds = new Set(pieceList.map((p) => p.project_id));
      if (projectIds.size > 1) throw new Error("multi_project");
      const firstProjectId = pieceList[0].project_id;
      setProjectId(firstProjectId);
      setPieces(pieceList.map((p) => ({ id: p.id, name: p.name })));
      setActivePieceId(pieceList[0].id);

      // 2) Chercher/créer nomenclature
      const { data: nomData } = await supabase
        .from("nomenclatures")
        .select("id")
        .eq("project_id", firstProjectId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      let nomId = (nomData as { id: string } | null)?.id;
      if (!nomId) {
        const { data: created, error: createErr } = await supabase
          .from("nomenclatures")
          .insert({
            company_id: staffUser.company_id,
            project_id: firstProjectId,
            name: pieceList[0].name,
            created_by: staffUser.id,
          })
          .select("id")
          .single();
        if (createErr) throw createErr;
        nomId = (created as { id: string }).id;
      }
      setNomenclatureId(nomId);

      // 3) Charger opérations + matières
      const [ops, mats] = await Promise.all([
        listOperations(nomId),
        listMaterials(nomId),
      ]);
      setOperations(ops);
      setMaterials(mats);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("etude.costing.loadError"));
    } finally {
      setIsLoading(false);
    }
  }, [pieceIds, staffUser, t]);

  useEffect(() => {
    void load();
  }, [load]);

  // Filtres
  const activeOps = useMemo(
    () => operations.filter((o) => o.piece_task_id === activePieceId),
    [operations, activePieceId]
  );
  const activeMats = useMemo(
    () => materials.filter((m) => m.piece_task_id === activePieceId),
    [materials, activePieceId]
  );

  const totalOps = useMemo(() => activeOps.reduce((s, o) => s + o.subtotal, 0), [activeOps]);
  const totalMats = useMemo(() => activeMats.reduce((s, m) => s + m.subtotal, 0), [activeMats]);
  const grandTotal = totalOps + totalMats;

  async function handleAddOperation(stageKey: CostingOperation["stage"]) {
    if (!staffUser || !nomenclatureId || !activePieceId) return;
    const def = getStageDef(stageKey);
    const newOp = await createOperation({
      company_id: staffUser.company_id,
      nomenclature_id: nomenclatureId,
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

  async function handleAddMaterial() {
    if (!staffUser || !nomenclatureId || !activePieceId) return;
    const newMat = await createMaterial({
      company_id: staffUser.company_id,
      nomenclature_id: nomenclatureId,
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

  async function handleSave(validate = false) {
    if (!nomenclatureId) return;
    setIsSaving(true);
    setError(null);
    try {
      const patch: Record<string, unknown> = { total_estimated_cost: grandTotal };
      if (validate) {
        patch.status = "valide";
        patch.validated_at = new Date().toISOString();
        patch.validated_by = staffUser?.id ?? null;
      }
      await supabase.from("nomenclatures").update(patch).eq("id", nomenclatureId);

      // Sync CNC pivot (best-effort)
      for (const p of pieces) {
        const pieceOps = operations.filter((o) => o.piece_task_id === p.id && o.stage === "usinage_cnc");
        const hrs = pieceOps.reduce((s, o) => s + o.estimated_hours, 0);
        const cost = pieceOps.reduce((s, o) => s + o.subtotal, 0);
        if (hrs > 0) {
          await supabase
            .from("pieces_tasks")
            .update({
              cnc_estimated_hours: hrs,
              cnc_estimated_cost: cost,
              estimated_time_minutes: Math.round(hrs * 60),
            } as never)
            .eq("id", p.id);
        }
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-2 sm:p-4">
      <div className="flex h-[95vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-6 sm:py-4">
          <h2 className="min-w-0 flex-1 truncate text-base font-bold text-slate-800 sm:text-lg">
            {t("etude.costing.modalTitle", { count: pieceIds.length })}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="ms-2 shrink-0 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-3 sm:p-5">
          {isLoading ? (
            <div className="flex items-center justify-center py-20 text-slate-400">
              <Loader2 className="me-2 animate-spin" size={18} />
              {t("common.loading")}
            </div>
          ) : error ? (
            <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
          ) : (
            <div className="space-y-4">
              {/* Sélecteur de pièce */}
              {pieces.length > 1 && (
                <div>
                  <label className="mb-1 block text-xs font-semibold text-slate-500">
                    {t("costing.activePiece")}
                  </label>
                  <select
                    value={activePieceId ?? ""}
                    onChange={(e) => setActivePieceId(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold focus:border-indigo-400 focus:outline-none"
                  >
                    {pieces.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Opérations */}
              <div className="rounded-xl border border-slate-200 p-3 sm:p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-slate-700">
                    <Clock size={14} className="text-indigo-500" />
                    {t("costing.operationsSection")}
                  </h3>
                  <span className="text-sm font-bold text-indigo-700" dir="ltr">{totalOps.toFixed(2)}</span>
                </div>
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
                    <p className="rounded-lg bg-slate-50 py-4 text-center text-xs text-slate-400">
                      {t("costing.noOperations")}
                    </p>
                  )}
                </div>
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <p className="mb-2 text-[10px] font-semibold uppercase text-slate-500">{t("costing.addOperation")}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {STAGES.map((s) => (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => void handleAddOperation(s.key)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700"
                      >
                        <span>{s.icon}</span>
                        <span>{t(s.labelKey)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Matières */}
              <div className="rounded-xl border border-slate-200 p-3 sm:p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-slate-700">
                    <Package size={14} className="text-amber-500" />
                    {t("costing.materialsSection")}
                  </h3>
                  <span className="text-sm font-bold text-amber-700" dir="ltr">{totalMats.toFixed(2)}</span>
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
                    <p className="rounded-lg bg-slate-50 py-4 text-center text-xs text-slate-400">
                      {t("costing.noMaterials")}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => void handleAddMaterial()}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-lg border-2 border-dashed border-amber-300 bg-amber-50/50 px-3 py-1.5 text-[11px] font-bold text-amber-700 hover:border-amber-500"
                >
                  <Plus size={12} />
                  {t("costing.addMaterial")}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-3 sm:px-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-indigo-600">
                <TrendingUp size={11} />
                {t("costing.grandTotal")}
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-extrabold text-indigo-900" dir="ltr">
                  {grandTotal.toFixed(2)}
                </span>
                <span className="text-xs font-bold text-indigo-500">TND</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50"
              >
                {t("common.cancel")}
              </button>
              <button
                type="button"
                onClick={() => void handleSave(false)}
                disabled={isSaving || isLoading || !!error}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                {isSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                {t("etude.costing.save")}
              </button>
              <button
                type="button"
                onClick={() => void handleSave(true)}
                disabled={isSaving || isLoading || !!error}
                className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              >
                <CheckCircle2 size={14} />
                {t("etude.costing.confirm")}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}