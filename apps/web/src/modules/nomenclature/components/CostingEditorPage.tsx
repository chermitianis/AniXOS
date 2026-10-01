import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft, Plus, CheckCircle2, Save, Loader2, Star, Package,
  TrendingUp, Clock, CircleDashed,
} from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { OperationCard } from "../components/OperationCard";
import { MaterialCard } from "../components/MaterialCard";
import { getAvailableStages, getStageBilling, getStageDef } from "../lib/costingConstants";
import {
  listOperationsForPiece, createOperation, updateOperation, deleteOperation,
  listMaterialsForPiece, createMaterial, updateMaterial, deleteMaterial,
  listMaterialPrices,
  type CostingOperation, type CostingMaterial,
} from "../api/costingApi";
import { deriveProjectStatus } from "../../production/api/projectsStatusApi";
import type { Nomenclature, Client, Project } from "../../../shared/types/database";

type CostingStatus = "non_etudie" | "brouillon" | "en_attente" | "valide";

interface CostingEditorPageProps {
  nomenclature: Nomenclature;
  initialPieceTaskId: string;
  mode?: "study" | "resume";
  onBack: () => void;
}

interface PieceRow {
  id: string;
  code: string | null;
  name: string;
  material: string | null;
  quantity: number | null;
  estimated_time_minutes: number | null;
  costing_status: CostingStatus;
}

export function CostingEditorPage({
  nomenclature,
  initialPieceTaskId,
  onBack,
}: CostingEditorPageProps) {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();
  const companyId = staffUser?.company_id ?? null;

  const [piece, setPiece] = useState<PieceRow | null>(null);
  const [siblingPieces, setSiblingPieces] = useState<PieceRow[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [client, setClient] = useState<Client | null>(null);

  const [operations, setOperations] = useState<CostingOperation[]>([]);
  const [materials, setMaterials] = useState<CostingMaterial[]>([]);
  const [companyPrices, setCompanyPrices] = useState<Record<string, number>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePieceId, setActivePieceId] = useState<string>(initialPieceTaskId);

  // ---------------------------------------------------------------------
  // Synchronisation de activePieceId
  // ---------------------------------------------------------------------
  useEffect(() => {
    setActivePieceId(initialPieceTaskId);
  }, [initialPieceTaskId]);

  // ---------------------------------------------------------------------
  // Chargement
  // ---------------------------------------------------------------------
  const loadAll = useCallback(async () => {
    if (!companyId || !activePieceId) return;
    setIsLoading(true);
    setError(null);
    try {
      // 1) Pièces du projet
      let siblingRows: PieceRow[] = [];
      if (nomenclature.project_id) {
        const { data: piecesData, error: pErr } = await supabase
          .from("pieces_tasks")
          .select("id, code, name, material, quantity, estimated_time_minutes, costing_status")
          .eq("company_id", companyId)
          .eq("project_id", nomenclature.project_id)
          .order("sequence_order");
        if (pErr) throw pErr;
        siblingRows = (piecesData as PieceRow[]) ?? [];
      }
      setSiblingPieces(siblingRows);
      const current =
        siblingRows.find((p) => p.id === activePieceId) ?? siblingRows[0] ?? null;
      setPiece(current);

      // 2) Projet + client
      if (nomenclature.project_id) {
        const { data: projData } = await supabase
          .from("projects")
          .select("*")
          .eq("company_id", companyId)
          .eq("id", nomenclature.project_id)
          .maybeSingle();
        setProject(projData as Project | null);
        if ((projData as Project | null)?.client_id) {
          const { data: clientData } = await supabase
            .from("clients")
            .select("*")
            .eq("company_id", companyId)
            .eq("id", (projData as Project).client_id)
            .maybeSingle();
          setClient(clientData as Client | null);
        }
      }

      // 3) Prix matières (par entreprise)
      const prices = await listMaterialPrices(companyId);
      const pricesMap: Record<string, number> = {};
      for (const p of prices) pricesMap[p.material_id] = Number(p.price_per_kg);
      setCompanyPrices(pricesMap);

      // 4) Opérations + matières de la pièce active
      const [ops, mats] = await Promise.all([
        listOperationsForPiece(companyId, activePieceId),
        listMaterialsForPiece(companyId, activePieceId),
      ]);
      setOperations(ops);
      setMaterials(mats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsLoading(false);
    }
  }, [companyId, nomenclature.project_id, activePieceId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // ---------------------------------------------------------------------
  // Totaux
  // ---------------------------------------------------------------------
  const grandTotal = useMemo(
    () =>
      operations.reduce((s, o) => s + Number(o.subtotal || 0), 0) +
      materials.reduce((s, m) => s + Number(m.subtotal || 0), 0),
    [operations, materials],
  );

  const totalOps = useMemo(
    () => operations.reduce((s, o) => s + Number(o.subtotal || 0), 0),
    [operations],
  );
  const totalMats = useMemo(
    () => materials.reduce((s, m) => s + Number(m.subtotal || 0), 0),
    [materials],
  );

  const cncCost = useMemo(
    () =>
      operations
        .filter((o) => o.stage === "usinage_cnc")
        .reduce((s, o) => s + Number(o.subtotal || 0), 0),
    [operations],
  );
  const cncHours = useMemo(
    () =>
      operations
        .filter((o) => o.stage === "usinage_cnc")
        .reduce((s, o) => s + Number(o.estimated_hours || 0), 0),
    [operations],
  );

  // ---------------------------------------------------------------------
  // CRUD opérations
  // ---------------------------------------------------------------------
  async function handleAddOperation(stageKey: CostingOperation["stage"]) {
    if (!staffUser || !companyId || !piece) return;
    const def = getStageDef(stageKey);
    const billing = getStageBilling(stageKey);
    try {
      const newOp = await createOperation({
        company_id: companyId,
        nomenclature_id: nomenclature.id,
        piece_task_id: piece.id,
        stage: stageKey,
        label: null,
        estimated_hours: 0,
        hourly_rate: billing === "hours" ? def.defaultHourlyRate ?? 0 : 0,
        quantity_pieces: billing === "pieces" ? (piece.quantity ?? 1) : 1,
        unit_price: billing === "pieces" ? def.defaultUnitPrice ?? 0 : null,
        stt_type: null,
        notes: null,
        sequence_order: operations.length,
      });
      setOperations((prev) => [...prev, newOp]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur ajout opération");
    }
  }

  async function handleUpdateOperation(id: string, patch: Partial<CostingOperation>) {
    if (!companyId) return;
    // Recalcul local du subtotal
    setOperations((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o;
        const updated = { ...o, ...patch };
        const billing = getStageBilling(updated.stage);
        if (billing === "pieces") {
          updated.subtotal =
            Number(updated.quantity_pieces || 0) * Number(updated.unit_price || 0);
        } else {
          updated.subtotal =
            Number(updated.estimated_hours || 0) * Number(updated.hourly_rate || 0);
        }
        return updated;
      }),
    );
    try {
      await updateOperation(id, companyId, patch);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur mise à jour opération");
    }
  }

  async function handleDeleteOperation(id: string) {
    if (!companyId) return;
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      await deleteOperation(id, companyId);
      setOperations((prev) => prev.filter((o) => o.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur suppression opération");
    }
  }

  // ---------------------------------------------------------------------
  // CRUD matières
  // ---------------------------------------------------------------------
  async function handleAddMaterial() {
    if (!staffUser || !companyId || !piece) return;
    try {
      const newMat = await createMaterial({
        company_id: companyId,
        nomenclature_id: nomenclature.id,
        piece_task_id: piece.id,
        material_name: "",
        material_code: null,
        calculation_mode: "weight",
        mass_volumique: null,
        diameter: null,
        length: null,
        width: null,
        thickness: null,
        quantity_pieces: piece.quantity ?? 1,
        quantity: 0,
        unit: "kg",
        unit_price: 0,
        price_per_kg: null,
        material_total: null,
        notes: null,
        sequence_order: materials.length,
      });
      setMaterials((prev) => [...prev, newMat]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur ajout matière");
    }
  }

  async function handleUpdateMaterial(id: string, patch: Partial<CostingMaterial>) {
    if (!companyId) return;
    setMaterials((prev) =>
      prev.map((m) => {
        if (m.id !== id) return m;
        const updated = { ...m, ...patch };
        // Le subtotal reste calculé par la DB (colonne générée)
        return updated;
      }),
    );
    try {
      await updateMaterial(id, companyId, patch);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur mise à jour matière");
    }
  }

  async function handleDeleteMaterial(id: string) {
    if (!companyId) return;
    if (!window.confirm(t("common.confirmDelete"))) return;
    try {
      await deleteMaterial(id, companyId);
      setMaterials((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur suppression matière");
    }
  }

  // ---------------------------------------------------------------------
  // Sync CNC + primary_operation_type
  // ---------------------------------------------------------------------
  async function syncCncToPiece() {
    if (!companyId || !piece || cncHours <= 0) return;
    await supabase
      .from("pieces_tasks")
      .update({
        cnc_estimated_hours: cncHours,
        cnc_estimated_cost: cncCost,
        estimated_time_minutes: Math.round(cncHours * 60),
      } as never)
      .eq("id", piece.id)
      .eq("company_id", companyId);
  }

  async function syncPrimaryOperationType() {
    if (!companyId || !piece || operations.length === 0) return;
    const primaryOp =
      operations.find((o) => o.stage === "usinage_cnc") ?? operations[0];
    await supabase
      .from("pieces_tasks")
      .update({ primary_operation_type: primaryOp.stage } as never)
      .eq("id", piece.id)
      .eq("company_id", companyId);
  }

  async function updatePieceStatus(newStatus: CostingStatus) {
    if (!companyId || !piece) return;
    await supabase
      .from("pieces_tasks")
      .update({ costing_status: newStatus } as never)
      .eq("id", piece.id)
      .eq("company_id", companyId);
  }

  async function syncProjectStatusFromPieces() {
    if (!companyId || !project || !staffUser) return;
    await deriveProjectStatus(project.id, companyId);
    const { data } = await supabase
      .from("pieces_tasks")
      .select("costing_status")
      .eq("company_id", companyId)
      .eq("project_id", project.id);
    const all = (data ?? []) as { costing_status: CostingStatus }[];
    if (all.length > 0 && all.every((p) => p.costing_status === "valide")) {
      await supabase
        .from("nomenclatures")
        .update({
          status: "valide",
          validated_at: new Date().toISOString(),
          validated_by_staff_id: staffUser.id,
        } as never)
        .eq("id", nomenclature.id)
        .eq("company_id", companyId);
    }
  }

  // ---------------------------------------------------------------------
  // Enregistrer / Confirmer
  // ---------------------------------------------------------------------
  async function handleSaveDraft() {
    if (!companyId) return;
    setIsSaving(true);
    setError(null);
    try {
      await supabase
        .from("nomenclatures")
        .update({ total_estimated_cost: grandTotal })
        .eq("id", nomenclature.id)
        .eq("company_id", companyId);
      await syncCncToPiece();
      await syncPrimaryOperationType();
      await updatePieceStatus("brouillon");
      await syncProjectStatusFromPieces();
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleConfirm() {
    if (!staffUser || !companyId) return;
    setIsValidating(true);
    setError(null);
    try {
      if (grandTotal <= 0) {
        setError("Ajoutez au moins une opération ou une matière avant de confirmer.");
        setIsValidating(false);
        return;
      }
      await supabase
        .from("nomenclatures")
        .update({
          total_estimated_cost: grandTotal,
          status: "valide",
          validated_at: new Date().toISOString(),
          validated_by_staff_id: staffUser.id,
        } as never)
        .eq("id", nomenclature.id)
        .eq("company_id", companyId);
      await syncCncToPiece();
      await syncPrimaryOperationType();
      await updatePieceStatus("valide");
      await syncProjectStatusFromPieces();
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setIsValidating(false);
    }
  }

  function switchPiece(id: string) {
    setActivePieceId(id);
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

  if (!piece) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center text-sm text-slate-500">
        Aucune pièce dans ce projet.
        <button onClick={onBack} className="mt-3 block mx-auto font-semibold text-indigo-600">
          ← Retour
        </button>
      </div>
    );
  }

  const usedStages = operations.map((o) => o.stage);
  const availableStages = getAvailableStages(usedStages);

  const pieceStatusMeta = {
    non_etudie: { label: "Non étudié", cls: "bg-slate-100 text-slate-600" },
    brouillon:  { label: "Brouillon",  cls: "bg-amber-100 text-amber-700" },
    en_attente: { label: "En étude",   cls: "bg-blue-100 text-blue-700" },
    valide:     { label: "Validé",     cls: "bg-green-100 text-green-700" },
  }[piece.costing_status];

  const validatedCount = siblingPieces.filter((p) => p.costing_status === "valide").length;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
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
          <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${pieceStatusMeta.cls}`}>
            {pieceStatusMeta.label}
          </span>
        </div>

        {/* Carte pièce */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Package size={16} className="shrink-0 text-indigo-600" />
              <h2 className="truncate text-base font-extrabold text-slate-800">
                {piece.name}
              </h2>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-mono" dir="ltr">{piece.code ?? "—"}</span>
              {project && <span>· {project.name}</span>}
              {client && <span>· {client.name}</span>}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
              {piece.material && <span>{piece.material}</span>}
              {piece.quantity && <span>· Qté {piece.quantity}</span>}
            </div>
          </div>
        </div>

        {/* OPÉRATIONS */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600">
                <Clock size={16} />
              </div>
              <h3 className="text-base font-bold text-slate-800">
                {t("costing.operationsSection")}
              </h3>
            </div>
            <span className="text-sm font-bold text-indigo-700" dir="ltr">
              {totalOps.toFixed(2)} TND
            </span>
          </div>

          <div className="space-y-2">
            {operations.map((op) => (
              <OperationCard
                key={op.id}
                operation={op}
                pieceQuantity={piece.quantity ?? 1}
                onChange={(patch) => void handleUpdateOperation(op.id, patch)}
                onDelete={() => void handleDeleteOperation(op.id)}
              />
            ))}
            {operations.length === 0 && (
              <p className="rounded-lg bg-slate-50 py-6 text-center text-sm text-slate-400">
                {t("costing.noOperations")}
              </p>
            )}
          </div>

          <div className="mt-3 border-t border-slate-100 pt-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {t("costing.addOperation")}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {availableStages.map((s) => (
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
              {availableStages.length === 0 && (
                <span className="text-xs text-slate-400">
                  {t("costing.allStagesUsed")}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* MATIÈRES */}
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-600">
                <Package size={16} />
              </div>
              <h3 className="text-base font-bold text-slate-800">
                {t("costing.materialsSection")}
              </h3>
            </div>
            <span className="text-sm font-bold text-amber-700" dir="ltr">
              {totalMats.toFixed(2)} TND
            </span>
          </div>

          <div className="space-y-2">
            {materials.map((m) => (
              <MaterialCard
                key={m.id}
                material={m}
                companyPrices={companyPrices}
                onChange={(patch) => void handleUpdateMaterial(m.id, patch)}
                onDelete={() => void handleDeleteMaterial(m.id)}
              />
            ))}
            {materials.length === 0 && (
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

        {/* RÉCAP CNC */}
        {cncHours > 0 && (
          <div className="rounded-xl border-2 border-amber-300 bg-gradient-to-br from-amber-50 to-orange-50 p-4">
            <div className="flex items-center gap-2">
              <Star size={16} className="text-amber-500" />
              <h3 className="text-sm font-bold text-amber-800">
                {t("costing.cncPivotTitle")}
              </h3>
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
          </div>
        )}

        {/* TOTAL + ACTIONS */}
        <div className="rounded-xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-blue-50 p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-indigo-600">
                <TrendingUp size={14} />
                Total pièce
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-3xl font-extrabold text-indigo-900" dir="ltr">
                  {grandTotal.toFixed(2)}
                </span>
                <span className="text-sm font-bold text-indigo-500">TND</span>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void handleSaveDraft()}
                disabled={isSaving || isValidating}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-slate-900 disabled:opacity-50"
              >
                {isSaving ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />}
                {t("common.save")}
              </button>
              <button
                onClick={() => void handleConfirm()}
                disabled={isSaving || isValidating || piece.costing_status === "valide"}
                className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
              >
                {isValidating ? <Loader2 size={15} className="animate-spin" /> : <CheckCircle2 size={15} />}
                Confirmer
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
        )}
      </div>

      {/* Sidebar */}
      <aside className="h-fit space-y-3 lg:sticky lg:top-4">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <div className="mb-2 flex items-center gap-2">
            <CircleDashed size={14} className="text-indigo-600" />
            <h3 className="text-xs font-bold uppercase tracking-wide text-slate-500">
              Autres pièces du projet
            </h3>
          </div>
          <ul className="space-y-1">
            {siblingPieces.map((p) => {
              const isActive = p.id === piece.id;
              const meta =
                p.costing_status === "valide" ? "text-green-600"
                : p.costing_status === "en_attente" ? "text-blue-600"
                : p.costing_status === "brouillon" ? "text-amber-600"
                : "text-slate-400";
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => switchPiece(p.id)}
                    className={`w-full rounded-lg px-2 py-1.5 text-start text-xs transition-colors ${
                      isActive ? "bg-indigo-50 font-bold text-indigo-700" : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="truncate">{p.name}</span>
                      <span className={`shrink-0 ${meta}`}>●</span>
                    </div>
                    <div className="truncate font-mono text-[10px] text-slate-400" dir="ltr">
                      {p.code ?? "—"}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-indigo-700">Projet</h3>
          <div className="space-y-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Validées</span>
              <span className="font-bold text-indigo-700">{validatedCount}/{siblingPieces.length}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Total</span>
              <span className="font-bold text-indigo-700" dir="ltr">
                {grandTotal.toFixed(2)} TND
              </span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}