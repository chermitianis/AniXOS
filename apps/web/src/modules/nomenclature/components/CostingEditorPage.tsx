import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ArrowLeft, Plus, CheckCircle2, Save, Loader2, Star, Package,
  TrendingUp, Clock, Send, CircleDashed,
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
import type { Nomenclature, PieceTask, Client, Project } from "../../../shared/types/database";

type CostingStatus = "non_etudie" | "brouillon" | "en_attente" | "valide";

interface CostingEditorPageProps {
  nomenclature: Nomenclature;
  initialPieceTaskId: string;
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

  const [piece, setPiece] = useState<PieceRow | null>(null);
  const [siblingPieces, setSiblingPieces] = useState<PieceRow[]>([]);
  const [project, setProject] = useState<Project | null>(null);
  const [client, setClient] = useState<Client | null>(null);

  const [operations, setOperations] = useState<CostingOperation[]>([]);
  const [materials, setMaterials] = useState<CostingMaterial[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isValidating, setIsValidating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activePieceId, setActivePieceId] = useState<string>(initialPieceTaskId);

  // ---------------------------------------------------------------------
  // Chargement
  // ---------------------------------------------------------------------
  const loadAll = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      let siblingRows: PieceRow[] = [];
      if (nomenclature.project_id) {
        const { data: piecesData } = await supabase
          .from("pieces_tasks")
          .select("id, code, name, material, quantity, estimated_time_minutes, costing_status")
          .eq("project_id", nomenclature.project_id)
          .order("sequence_order");
        siblingRows = (piecesData as PieceRow[]) ?? [];
      }
      setSiblingPieces(siblingRows);
      const current =
        siblingRows.find((p) => p.id === activePieceId) ?? siblingRows[0] ?? null;
      setPiece(current);

      if (nomenclature.project_id) {
        const { data: projData } = await supabase
          .from("projects")
          .select("*")
          .eq("id", nomenclature.project_id)
          .maybeSingle();
        setProject(projData as Project | null);
        if ((projData as Project | null)?.client_id) {
          const { data: clientData } = await supabase
            .from("clients")
            .select("*")
            .eq("id", (projData as Project).client_id)
            .maybeSingle();
          setClient(clientData as Client | null);
        }
      }

      const [ops, mats] = await Promise.all([
        listOperations(nomenclature.id),
        listMaterials(nomenclature.id),
      ]);
      setOperations(ops);
      setMaterials(mats);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsLoading(false);
    }
  }, [nomenclature.id, nomenclature.project_id, activePieceId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  // ---------------------------------------------------------------------
  // Opérations et matières de la pièce active
  // ---------------------------------------------------------------------
  const activeOps = useMemo(
    () => (piece ? operations.filter((o) => o.piece_task_id === piece.id) : []),
    [operations, piece],
  );
  const activeMats = useMemo(
    () => (piece ? materials.filter((m) => m.piece_task_id === piece.id) : []),
    [materials, piece],
  );

  const grandTotal = useMemo(
    () =>
      operations.reduce((s, o) => s + Number(o.subtotal || 0), 0) +
      materials.reduce((s, m) => s + Number(m.subtotal || 0), 0),
    [operations, materials],
  );

  const pieceTotal = useMemo(
    () =>
      activeOps.reduce((s, o) => s + Number(o.subtotal || 0), 0) +
      activeMats.reduce((s, m) => s + Number(m.subtotal || 0), 0),
    [activeOps, activeMats],
  );

  const totalOps = useMemo(
    () => activeOps.reduce((s, o) => s + Number(o.subtotal || 0), 0),
    [activeOps],
  );
  const totalMats = useMemo(
    () => activeMats.reduce((s, m) => s + Number(m.subtotal || 0), 0),
    [activeMats],
  );

  const cncCost = useMemo(
    () =>
      activeOps
        .filter((o) => o.stage === "usinage_cnc")
        .reduce((s, o) => s + Number(o.subtotal || 0), 0),
    [activeOps],
  );
  const cncHours = useMemo(
    () =>
      activeOps
        .filter((o) => o.stage === "usinage_cnc")
        .reduce((s, o) => s + Number(o.estimated_hours || 0), 0),
    [activeOps],
  );

  // ---------------------------------------------------------------------
  // Actions CRUD
  // ---------------------------------------------------------------------
  async function handleAddOperation(stageKey: CostingOperation["stage"]) {
    if (!staffUser || !piece) return;
    const def = getStageDef(stageKey);
    const newOp = await createOperation({
      company_id: staffUser.company_id,
      nomenclature_id: nomenclature.id,
      piece_task_id: piece.id,
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
        updated.subtotal =
          Number(updated.estimated_hours || 0) * Number(updated.hourly_rate || 0);
        return updated;
      }),
    );
    await updateOperation(id, patch);
  }

  async function handleDeleteOperation(id: string) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    await deleteOperation(id);
    setOperations((prev) => prev.filter((o) => o.id !== id));
  }

  async function handleAddMaterial() {
    if (!staffUser || !piece) return;
    const newMat = await createMaterial({
      company_id: staffUser.company_id,
      nomenclature_id: nomenclature.id,
      piece_task_id: piece.id,
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
        updated.subtotal = Number(updated.quantity || 0) * Number(updated.unit_price || 0);
        return updated;
      }),
    );
    await updateMaterial(id, patch);
  }

  async function handleDeleteMaterial(id: string) {
    if (!window.confirm(t("common.confirmDelete"))) return;
    await deleteMaterial(id);
    setMaterials((prev) => prev.filter((m) => m.id !== id));
  }

  // ---------------------------------------------------------------------
  // Sync CNC + primary_operation_type vers pieces_tasks
  // ---------------------------------------------------------------------
  async function syncCncToPiece() {
    if (!piece || cncHours <= 0) return;
    await supabase
      .from("pieces_tasks")
      .update({
        cnc_estimated_hours: cncHours,
        cnc_estimated_cost: cncCost,
        estimated_time_minutes: Math.round(cncHours * 60),
      } as never)
      .eq("id", piece.id);
  }

  /**
   * Détermine le type d'opération principale de la pièce :
   * priorité à usinage_cnc (pivot), sinon première opération.
   * Écrit dans pieces_tasks.primary_operation_type.
   */
  async function syncPrimaryOperationType() {
    if (!piece || activeOps.length === 0) return;
    const primaryOp =
      activeOps.find((o) => o.stage === "usinage_cnc") ?? activeOps[0];
    await supabase
      .from("pieces_tasks")
      .update({ primary_operation_type: primaryOp.stage } as never)
      .eq("id", piece.id);
  }

  async function updatePieceStatus(newStatus: CostingStatus) {
    if (!piece) return;
    await supabase
      .from("pieces_tasks")
      .update({ costing_status: newStatus } as never)
      .eq("id", piece.id);
    setPiece((p) => (p ? { ...p, costing_status: newStatus } : p));
  }

  async function checkProjectAutoApproval() {
    if (!project || !staffUser) return;
    const { data } = await supabase
      .from("pieces_tasks")
      .select("costing_status")
      .eq("project_id", project.id);
    const all = (data ?? []) as { costing_status: CostingStatus }[];
    if (all.length > 0 && all.every((p) => p.costing_status === "valide")) {
      await supabase
        .from("projects")
        .update({
          status: "approved",
          study_completed_at: new Date().toISOString(),
        } as never)
        .eq("id", project.id);
      await supabase
        .from("nomenclatures")
        .update({
          status: "valide",
          validated_at: new Date().toISOString(),
          validated_by_staff_id: staffUser.id,
        } as never)
        .eq("id", nomenclature.id);
    }
  }

  // ---------------------------------------------------------------------
  // Enregistrer
  // ---------------------------------------------------------------------
  async function handleSaveDraft() {
    setIsSaving(true);
    setError(null);
    try {
      const { error: nomErr } = await supabase
        .from("nomenclatures")
        .update({ total_estimated_cost: grandTotal })
        .eq("id", nomenclature.id);

      if (nomErr) {
        setError(`Erreur enregistrement : ${nomErr.message}`);
        setIsSaving(false);
        return;
      }

      await syncCncToPiece();
      await syncPrimaryOperationType();
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setIsSaving(false);
    }
  }

  // ---------------------------------------------------------------------
  // En attente
  // ---------------------------------------------------------------------
  async function handleSubmitForReview() {
    if (!staffUser) return;
    setIsSaving(true);
    setError(null);
    try {
      if (grandTotal <= 0) {
        setError("Ajoutez au moins une opération ou une matière avant de soumettre.");
        setIsSaving(false);
        return;
      }

      const { error: nomErr } = await supabase
        .from("nomenclatures")
        .update({
          total_estimated_cost: grandTotal,
          status: "en_attente",
        } as never)
        .eq("id", nomenclature.id);

      if (nomErr) {
        setError(`Erreur : ${nomErr.message}`);
        setIsSaving(false);
        return;
      }

      if (nomenclature.project_id) {
        await supabase
          .from("projects")
          .update({
            status: "studying",
            study_started_at: new Date().toISOString(),
          } as never)
          .eq("id", nomenclature.project_id);
      }

      await syncCncToPiece();
      await syncPrimaryOperationType();
      await updatePieceStatus("en_attente");
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
      setIsSaving(false);
    }
  }

  // ---------------------------------------------------------------------
  // Confirmer
  // ---------------------------------------------------------------------
  async function handleConfirm() {
    if (!staffUser) return;
    setIsValidating(true);
    setError(null);
    try {
      if (grandTotal <= 0) {
        setError("Ajoutez au moins une opération ou une matière avant de confirmer.");
        setIsValidating(false);
        return;
      }

      const { error: nomErr } = await supabase
        .from("nomenclatures")
        .update({
          total_estimated_cost: grandTotal,
          status: "valide",
          validated_at: new Date().toISOString(),
          validated_by_staff_id: staffUser.id,
        } as never)
        .eq("id", nomenclature.id);

      if (nomErr) {
        setError(`Erreur nomenclature : ${nomErr.message}`);
        setIsValidating(false);
        return;
      }

      if (nomenclature.project_id) {
        const { error: projErr } = await supabase
          .from("projects")
          .update({
            status: "approved",
            study_completed_at: new Date().toISOString(),
          } as never)
          .eq("id", nomenclature.project_id);
        if (projErr) {
          setError(`Erreur projet : ${projErr.message}`);
          setIsValidating(false);
          return;
        }
      }

      await syncCncToPiece();
      await syncPrimaryOperationType();
      await updatePieceStatus("valide");
      await checkProjectAutoApproval();
      onBack();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
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
        Aucune pièce dans ce projet. Ajoutez-en depuis « Projets à étudier ».
        <button
          onClick={onBack}
          className="mt-3 block mx-auto font-semibold text-indigo-600"
        >
          ← Retour
        </button>
      </div>
    );
  }

  const pieceStatusMeta = {
    non_etudie: { label: "Non étudié", cls: "bg-slate-100 text-slate-600" },
    brouillon:  { label: "Brouillon",  cls: "bg-amber-100 text-amber-700" },
    en_attente: { label: "En attente", cls: "bg-blue-100 text-blue-700" },
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
          <span
            className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${pieceStatusMeta.cls}`}
          >
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
                <div className="text-[10px] uppercase text-amber-600">
                  {t("costing.hours")}
                </div>
                <div className="text-base font-extrabold text-amber-800" dir="ltr">
                  {cncHours.toFixed(2)} h
                </div>
              </div>
              <div>
                <div className="text-[10px] uppercase text-amber-600">
                  {t("costing.subtotal")}
                </div>
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
                  {pieceTotal.toFixed(2)}
                </span>
                <span className="text-sm font-bold text-indigo-500">TND</span>
              </div>
              {pieceTotal !== grandTotal && (
                <div className="mt-1 text-[11px] text-indigo-500">
                  Total nomenclature :{" "}
                  <span className="font-bold" dir="ltr">
                    {grandTotal.toFixed(2)} TND
                  </span>
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => void handleSaveDraft()}
                disabled={isSaving || isValidating}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-slate-900 disabled:opacity-50"
              >
                {isSaving ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <Save size={15} />
                )}
                {t("common.save")}
              </button>
              <button
                onClick={() => void handleSubmitForReview()}
                disabled={isSaving || isValidating || piece.costing_status === "valide"}
                className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
              >
                <Send size={15} />
                En attente
              </button>
              <button
                onClick={() => void handleConfirm()}
                disabled={isSaving || isValidating || piece.costing_status === "valide"}
                className="inline-flex items-center gap-1.5 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-bold text-white transition-colors hover:bg-green-700 disabled:opacity-50"
              >
                {isValidating ? (
                  <Loader2 size={15} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={15} />
                )}
                Confirmer
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
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
                p.costing_status === "valide"
                  ? "text-green-600"
                  : p.costing_status === "en_attente"
                    ? "text-blue-600"
                    : p.costing_status === "brouillon"
                      ? "text-amber-600"
                      : "text-slate-400";
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => switchPiece(p.id)}
                    className={`w-full rounded-lg px-2 py-1.5 text-start text-xs transition-colors ${
                      isActive
                        ? "bg-indigo-50 font-bold text-indigo-700"
                        : "text-slate-600 hover:bg-slate-50"
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
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-indigo-700">
            Projet
          </h3>
          <div className="space-y-1 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-500">Validées</span>
              <span className="font-bold text-indigo-700">
                {validatedCount}/{siblingPieces.length}
              </span>
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