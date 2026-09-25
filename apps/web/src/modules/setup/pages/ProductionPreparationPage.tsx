import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Loader2, Package, FolderOpen, FileText, Cog, AlertTriangle,
  CheckCircle2, XCircle, ChevronRight, ArrowLeft, Wrench,
  Cpu, Printer as PrintIcon, ArrowRight, Info as InfoIcon,
} from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { useNav } from "../../../app/NavContext";
import { STAGES, getStageDef, getStageInterface, type OperationInterface } from "../../nomenclature/lib/costingConstants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ProductionStatus =
  | "sent" | "in_preparation" | "ready_to_start" | "scheduled"
  | "in_progress" | "completed" | "on_hold";

interface PieceRow {
  id: string;
  code: string | null;
  name: string;
  material: string | null;
  quantity: number | null;
  estimated_time_minutes: number | null;
  cnc_estimated_hours: number | null;
  cnc_estimated_cost: number | null;
  primary_operation_type: string | null;
  production_status: ProductionStatus;
  project_id: string;
  project_name: string;
  project_code: string;
  client_name: string | null;
  due_date: string | null;
}

interface OperationRow {
  id: string;
  stage: string;
  estimated_hours: number;
  hourly_rate: number;
  subtotal: number;
  sequence_order: number;
  machine_id: string | null;
  label: string | null;
}

interface DocumentRow {
  id: string;
  doc_type: string;
  title: string;
  url: string;
}

interface MachineOption {
  id: string;
  name: string;
  code: string | null;
  interface_type: OperationInterface;
}

interface ExistingOf {
  id: string;
  order_number: string;
  status: string;
}

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

export function ProductionPreparationPage() {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();
  const nav = useNav();

  const [pieces, setPieces] = useState<PieceRow[]>([]);
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedPiece, setSelectedPiece] = useState<PieceRow | null>(null);
  const [pieceOps, setPieceOps] = useState<OperationRow[]>([]);
  const [pieceDocs, setPieceDocs] = useState<DocumentRow[]>([]);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [preparedOfNumber, setPreparedOfNumber] = useState<string | null>(null);
  const [existingOf, setExistingOf] = useState<ExistingOf | null>(null);

  // ---------------------------------------------------------------------
  // Chargement liste
  // ---------------------------------------------------------------------
  const load = useCallback(async () => {
    if (!staffUser?.company_id) return;
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: pErr } = await supabase
        .from("pieces_tasks")
        .select("*, projects(name, code, due_date, clients(name))")
        .eq("production_status", "sent")
        .order("sent_to_production_at", { ascending: false });

      if (pErr) throw pErr;

      const rows: PieceRow[] = ((data ?? []) as Record<string, unknown>[]).map((row) => {
        const proj = row.projects as {
          name?: string; code?: string; due_date?: string | null;
          clients?: { name?: string } | null;
        } | null;
        return {
          id: row.id as string,
          code: row.code as string | null,
          name: row.name as string,
          material: row.material as string | null,
          quantity: row.quantity as number | null,
          estimated_time_minutes: row.estimated_time_minutes as number | null,
          cnc_estimated_hours: row.cnc_estimated_hours as number | null,
          cnc_estimated_cost: row.cnc_estimated_cost as number | null,
          primary_operation_type: row.primary_operation_type as string | null,
          production_status: row.production_status as ProductionStatus,
          project_id: row.project_id as string,
          project_name: proj?.name ?? "—",
          project_code: proj?.code ?? "—",
          client_name: proj?.clients?.name ?? null,
          due_date: proj?.due_date ?? null,
        };
      });
      setPieces(rows);

      const { data: machData } = await supabase
        .from("machines")
        .select("id, name, code, interface_type")
        .eq("is_active", true)
        .order("name");
      setMachines((machData as MachineOption[]) ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsLoading(false);
    }
  }, [staffUser?.company_id]);

  useEffect(() => {
    void load();
  }, [load]);

  // ---------------------------------------------------------------------
  // Chargement détails (pièce sélectionnée)
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!selectedPiece) {
      setPieceOps([]);
      setPieceDocs([]);
      setExistingOf(null);
      return;
    }
    setIsLoadingDetails(true);
    setExistingOf(null);
    void (async () => {
      const [
        { data: ops },
        { data: docs },
        { data: existing },
      ] = await Promise.all([
        supabase
          .from("piece_costing_operations")
          .select("id, stage, estimated_hours, hourly_rate, subtotal, sequence_order, machine_id, label")
          .eq("piece_task_id", selectedPiece.id)
          .order("sequence_order"),
        supabase
          .from("piece_documents")
          .select("id, doc_type, title, url")
          .eq("piece_task_id", selectedPiece.id)
          .order("created_at", { ascending: false }),
        supabase
          .from("manufacturing_orders")
          .select("id, order_number, status")
          .eq("piece_task_id", selectedPiece.id)
          .maybeSingle(),
      ]);
      setPieceOps((ops as OperationRow[]) ?? []);
      setPieceDocs((docs as DocumentRow[]) ?? []);
      setExistingOf((existing as ExistingOf | null) ?? null);
      setIsLoadingDetails(false);
    })();
  }, [selectedPiece]);

  // ---------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------
  async function handleAssignMachine(opId: string, machineId: string | null) {
    await supabase
      .from("piece_costing_operations")
      .update({ machine_id: machineId } as never)
      .eq("id", opId);
    setPieceOps((prev) =>
      prev.map((o) => (o.id === opId ? { ...o, machine_id: machineId } : o)),
    );
  }

  async function handleSetPrimaryOperation(stage: string) {
    if (!selectedPiece) return;
    await supabase
      .from("pieces_tasks")
      .update({ primary_operation_type: stage } as never)
      .eq("id", selectedPiece.id);
    setSelectedPiece((p) => (p ? { ...p, primary_operation_type: stage } : p));
    setPieces((prev) =>
      prev.map((p) => (p.id === selectedPiece.id ? { ...p, primary_operation_type: stage } : p)),
    );
  }

  async function handlePrepare() {
    if (!selectedPiece || !staffUser) return;
    setIsPreparing(true);
    setError(null);
    try {
      // ⚠️ GARDE-FOU : vérifier qu'aucun OF n'existe déjà pour cette pièce
      const { data: checkOf } = await supabase
        .from("manufacturing_orders")
        .select("id, order_number, status")
        .eq("piece_task_id", selectedPiece.id)
        .maybeSingle();

      if (checkOf) {
        setExistingOf(checkOf as ExistingOf);
        setIsPreparing(false);
        return;
      }

      // Générer un numéro d'OF unique
      const { data: existingOrders } = await supabase
        .from("manufacturing_orders")
        .select("order_number")
        .eq("company_id", staffUser.company_id);
      const numeric = ((existingOrders ?? []) as { order_number: string }[])
        .map((o) => parseInt(o.order_number, 10))
        .filter((n) => !isNaN(n));
      const max = numeric.length > 0 ? Math.max(...numeric) : 0;
      const nextNumber = String(max + 1);

      // Créer OF
      const { data: newOrder, error: ofErr } = await supabase
        .from("manufacturing_orders")
        .insert({
          company_id: staffUser.company_id,
          project_id: selectedPiece.project_id,
          piece_task_id: selectedPiece.id,
          order_number: nextNumber,
          product_name: selectedPiece.name || selectedPiece.code || "—",
          quantity: selectedPiece.quantity ?? 1,
          status: "prepared",
          prepared_at: new Date().toISOString(),
          created_by: staffUser.id,
        } as never)
        .select()
        .single();

      if (ofErr || !newOrder) {
        // Si erreur duplicate (race condition), afficher message clair
        if (ofErr?.message.includes("duplicate")) {
          setError(t("production.preparation.ofAlreadyExists"));
        } else {
          setError(ofErr?.message ?? t("production.preparation.ofError"));
        }
        return;
      }

      // Lier pièce → OF + statut
      await supabase
        .from("pieces_tasks")
        .update({
          manufacturing_order_id: (newOrder as { id: string }).id,
          production_status: "ready_to_start",
        } as never)
        .eq("id", selectedPiece.id);

      setPreparedOfNumber(nextNumber);
      await load();
      setTimeout(() => {
        setSelectedPiece(null);
        setPreparedOfNumber(null);
      }, 1500);
    } finally {
      setIsPreparing(false);
    }
  }

  /** Annule l'OF existant et libère la pièce pour une nouvelle préparation */
  async function handleCancelExistingOf() {
    if (!selectedPiece || !existingOf) return;
    if (!window.confirm(t("production.preparation.confirmCancelOf"))) return;
    setIsPreparing(true);
    try {
      await supabase
        .from("manufacturing_orders")
        .update({ status: "cancelled" } as never)
        .eq("id", existingOf.id);
      setExistingOf(null);
      // L'OF est annulé → on peut maintenant créer un nouveau
      await handlePrepare();
    } finally {
      setIsPreparing(false);
    }
  }

  // ---------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------
  const readiness = useMemo(() => {
    if (!selectedPiece) return null;
    return {
      hasDocs: pieceDocs.length > 0,
      hasOps: pieceOps.length > 0,
      hasPrimary: !!selectedPiece.primary_operation_type,
    };
  }, [selectedPiece, pieceDocs, pieceOps]);

  const interfaceBadge = (opType: string | null) => {
    if (!opType) {
      return {
        label: t("production.preparation.badgeToDefine"),
        cls: "bg-amber-100 text-amber-700",
        icon: AlertTriangle,
      };
    }
    const iface = getStageInterface(opType);
    const def = getStageDef(opType as never);
    return {
      label: `${def.icon} ${t(def.labelKey)}`,
      cls: iface === "cnc"
        ? "bg-amber-100 text-amber-800"
        : "bg-blue-100 text-blue-700",
      icon: iface === "cnc" ? Cpu : Wrench,
    };
  };

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
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      {/* ─── Colonne gauche : liste des pièces en attente ─── */}
      <aside className="h-fit space-y-2">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">
            {t("production.preparation.toPrepare")} ({pieces.length})
          </h2>
        </div>
        <ul className="space-y-1.5">
          {pieces.map((p) => {
            const badge = interfaceBadge(p.primary_operation_type);
            const BadgeIcon = badge.icon;
            const isActive = selectedPiece?.id === p.id;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => setSelectedPiece(p)}
                  className={`w-full rounded-xl border px-3 py-2.5 text-start transition-colors ${
                    isActive
                      ? "border-indigo-300 bg-indigo-50"
                      : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-slate-800">
                        {p.name || "—"}
                      </div>
                      <div className="mt-0.5 truncate font-mono text-[10px] text-slate-400" dir="ltr">
                        {p.code ?? "—"}
                      </div>
                    </div>
                    <ChevronRight size={14} className="mt-0.5 shrink-0 text-slate-300" />
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${badge.cls}`}>
                      <BadgeIcon size={9} />
                      {badge.label}
                    </span>
                    <span className="truncate text-[10px] text-slate-400">
                      {p.project_name}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
          {pieces.length === 0 && (
            <li className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-8 text-center text-xs text-slate-400">
              {t("production.preparation.emptyQueue")}
            </li>
          )}
        </ul>
      </aside>

      {/* ─── Colonne droite : feuille de préparation ─── */}
      <div className="space-y-4">
        {!selectedPiece ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-400">
            <FolderOpen size={32} className="mx-auto mb-2 text-slate-300" />
            {t("production.preparation.selectPiece")}
          </div>
        ) : (
          <>
            {/* En-tête pièce */}
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Package size={16} className="text-indigo-600" />
                  <h1 className="text-base font-extrabold text-slate-800">
                    {selectedPiece.name || "—"}
                  </h1>
                  <span className="font-mono text-xs text-slate-400" dir="ltr">
                    {selectedPiece.code ?? "—"}
                  </span>
                </div>
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 print:hidden"
                >
                  <PrintIcon size={13} />
                  {t("common.print")}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                <Info label={t("setup.projectLabel")} value={selectedPiece.project_name} />
                <Info label={t("setup.client")} value={selectedPiece.client_name ?? "—"} />
                <Info label={t("setup.pieceMaterial")} value={selectedPiece.material ?? "—"} />
                <Info label={t("setup.quantity")} value={String(selectedPiece.quantity ?? 1)} />
                <Info
                  label={t("production.preparation.deadline")}
                  value={
                    selectedPiece.due_date
                      ? new Date(selectedPiece.due_date).toLocaleDateString("fr-FR")
                      : "—"
                  }
                />
                <Info
                  label={t("production.preparation.estimatedTime")}
                  value={
                    selectedPiece.estimated_time_minutes
                      ? `${Math.floor(selectedPiece.estimated_time_minutes / 60)}h${selectedPiece.estimated_time_minutes % 60}`
                      : "—"
                  }
                />
                <Info
                  label={t("production.preparation.estimatedCost")}
                  value={
                    selectedPiece.cnc_estimated_cost != null
                      ? `${Number(selectedPiece.cnc_estimated_cost).toFixed(2)} TND`
                      : "—"
                  }
                />
                <Info
                  label={t("production.preparation.primaryOp")}
                  value={
                    selectedPiece.primary_operation_type
                      ? t(getStageDef(selectedPiece.primary_operation_type as never).labelKey)
                      : "—"
                  }
                />
              </div>
            </div>

            {/* ⚠️ Bandeau OF existant */}
            {existingOf && (
              <div className="rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                    <InfoIcon size={20} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-amber-900">
                      {t("production.preparation.ofExistsTitle", { number: existingOf.order_number })}
                    </h3>
                    <p className="mt-1 text-xs text-amber-700">
                      {t("production.preparation.ofExistsBody")}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        onClick={() => nav.goToSection("production_ordres")}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700"
                      >
                        {t("production.preparation.viewOf")}
                        <ArrowRight size={12} />
                      </button>
                      {existingOf.status === "cancelled" && (
                        <button
                          onClick={() => void handleCancelExistingOf()}
                          disabled={isPreparing}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-amber-700 hover:bg-amber-50 disabled:opacity-50"
                        >
                          {t("production.preparation.reactivateOf")}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Vérifications */}
            {readiness && !existingOf && (
              <div className="grid gap-2 sm:grid-cols-3">
                <CheckItem
                  done={readiness.hasOps}
                  label={t("production.preparation.checkOps")}
                  hint={t("production.preparation.checkOpsHint")}
                />
                <CheckItem
                  done={readiness.hasDocs}
                  label={t("production.preparation.checkDocs")}
                  hint={t("production.preparation.checkDocsHint")}
                />
                <CheckItem
                  done={readiness.hasPrimary}
                  label={t("production.preparation.checkPrimary")}
                  hint={t("production.preparation.checkPrimaryHint")}
                />
              </div>
            )}

            {/* Opérations */}
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <Cog size={15} className="text-indigo-600" />
                <h2 className="text-sm font-bold text-slate-700">
                  {t("production.preparation.operations")} ({pieceOps.length})
                </h2>
              </div>
              {isLoadingDetails ? (
                <Loader2 size={16} className="mx-auto animate-spin text-slate-300" />
              ) : pieceOps.length === 0 ? (
                <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-3 text-xs text-amber-700">
                  <AlertTriangle size={14} className="shrink-0" />
                  {t("production.preparation.noOperations")}
                </div>
              ) : (
                <ul className="space-y-1.5">
                  {pieceOps.map((op, i) => {
                    const def = getStageDef(op.stage as never);
                    const iface = getStageInterface(op.stage);
                    const filteredMachines = machines.filter(
                      (m) => m.interface_type === iface || m.interface_type === "both",
                    );
                    return (
                      <li
                        key={op.id}
                        className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs"
                      >
                        <span className="shrink-0 text-slate-400">{i + 1}</span>
                        <span className="shrink-0 text-base">{def.icon}</span>
                        <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">
                          {t(def.labelKey)}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                            iface === "cnc"
                              ? "bg-amber-100 text-amber-800"
                              : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {iface.toUpperCase()}
                        </span>
                        <span className="shrink-0 font-mono text-[10px] text-slate-500" dir="ltr">
                          {op.estimated_hours}h × {op.hourly_rate}
                        </span>
                        <span className="shrink-0 font-bold text-slate-700" dir="ltr">
                          {op.subtotal.toFixed(2)}
                        </span>
                        <select
                          value={op.machine_id ?? ""}
                          onChange={(e) => void handleAssignMachine(op.id, e.target.value || null)}
                          className="shrink-0 rounded border border-slate-200 bg-white px-2 py-1 text-[10px]"
                        >
                          <option value="">{t("production.preparation.chooseMachine")}</option>
                          {filteredMachines.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.code ? `${m.code} — ` : ""}{m.name}
                            </option>
                          ))}
                        </select>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {/* Documents */}
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <FileText size={15} className="text-indigo-600" />
                <h2 className="text-sm font-bold text-slate-700">
                  {t("production.preparation.documents")} ({pieceDocs.length})
                </h2>
              </div>
              {pieceDocs.length === 0 ? (
                <p className="rounded-lg bg-slate-50 px-3 py-3 text-center text-xs text-slate-400">
                  {t("production.preparation.noDocuments")}
                </p>
              ) : (
                <ul className="space-y-1">
                  {pieceDocs.map((d) => (
                    <li key={d.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                      <FileText size={12} className="shrink-0 text-slate-400" />
                      <span className="min-w-0 flex-1 truncate text-slate-700">{d.title}</span>
                      <a
                        href={d.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="shrink-0 font-semibold text-indigo-600 hover:text-indigo-700"
                      >
                        {t("production.preparation.openDoc")} ↗
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Recalculer primary_operation_type */}
            {!selectedPiece.primary_operation_type && pieceOps.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                <div className="mb-2 text-xs font-bold text-amber-800">
                  {t("production.preparation.definePrimaryOp")}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {pieceOps.map((op) => {
                    const def = getStageDef(op.stage as never);
                    return (
                      <button
                        key={op.id}
                        onClick={() => void handleSetPrimaryOperation(op.stage)}
                        className="inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                      >
                        <span>{def.icon}</span>
                        {t(def.labelKey)}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Action principale */}
            {!existingOf && (
              <div className="sticky bottom-4 rounded-xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-blue-50 p-4 print:hidden">
                {preparedOfNumber ? (
                  <div className="flex items-center justify-center gap-2 py-1 text-sm font-bold text-green-700">
                    <CheckCircle2 size={16} />
                    {t("production.preparation.ofCreated", { number: preparedOfNumber })}
                  </div>
                ) : (
                  <button
                    onClick={() => void handlePrepare()}
                    disabled={isPreparing}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-3 text-sm font-bold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {isPreparing ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <CheckCircle2 size={16} />
                    )}
                    {t("production.preparation.prepareOf")}
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sous-composants
// ---------------------------------------------------------------------------

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-0.5 truncate text-sm font-semibold text-slate-700">{value}</div>
    </div>
  );
}

function CheckItem({
  done,
  label,
  hint,
}: {
  done: boolean;
  label: string;
  hint: string;
}) {
  const Icon = done ? CheckCircle2 : XCircle;
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
      <Icon
        size={16}
        className={`shrink-0 ${done ? "text-green-500" : "text-slate-300"}`}
      />
      <div className="min-w-0 flex-1">
        <div className="truncate text-xs font-semibold text-slate-700">{label}</div>
        <div className="truncate text-[10px] text-slate-400">{hint}</div>
      </div>
    </div>
  );
}