import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Loader2, Package, FolderOpen, FileText, Cog, AlertTriangle,
  CheckCircle2, ChevronRight, ArrowRight, Info as InfoIcon,
  Save, FilePlus2, PlusCircle, Hash,
} from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import {
  getStageDef, getStageInterface, getStageBilling, getSttTypeLabel,
} from "../../nomenclature/lib/costingConstants";
import {
  createOfFromPiece,
  getOfByPieceId,
  markOfReadyToPlan,
  updateOfDrawing,
  type OfWithRelations,
} from "../../production/api/manufacturingOrdersApi";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type ProductionStatus =
  | "sent" | "in_preparation" | "ready_to_start"
  | "scheduled" | "in_progress" | "completed" | "on_hold";

interface PieceRow {
  id: string;
  code: string | null;
  name: string;
  material: string | null;
  quantity: number | null;
  estimated_time_minutes: number | null;
  primary_operation_type: string | null;
  production_status: ProductionStatus;
  project_id: string;
  project_name: string;
  project_code: string;
  client_name: string | null;
  due_date: string | null;
  manufacturing_order_id: string | null;
}

interface OperationRow {
  id: string;
  stage: string;
  estimated_hours: number;
  hourly_rate: number;
  quantity_pieces: number;
  unit_price: number | null;
  stt_type: string | null;
  subtotal: number;
  sequence_order: number;
  label: string | null;
}

interface DocumentRow {
  id: string;
  doc_type: string;
  title: string;
  url: string;
}

// ---------------------------------------------------------------------------
export function ProductionPreparationPage() {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();
  const companyId = staffUser?.company_id ?? null;

  const [pieces, setPieces] = useState<PieceRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedPiece, setSelectedPiece] = useState<PieceRow | null>(null);
  const [pieceOps, setPieceOps] = useState<OperationRow[]>([]);
  const [pieceDocs, setPieceDocs] = useState<DocumentRow[]>([]);
  const [existingOf, setExistingOf] = useState<OfWithRelations | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);

  const [drawingUrl, setDrawingUrl] = useState("");
  const [drawingPathLocal, setDrawingPathLocal] = useState("");
  const [drawingPathNetwork, setDrawingPathNetwork] = useState("");
  const [ofNotes, setOfNotes] = useState("");

  const [isCreatingOf, setIsCreatingOf] = useState(false);
  const [isSavingDrawing, setIsSavingDrawing] = useState(false);
  const [isMarkingReady, setIsMarkingReady] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // ---------------------------------------------------------------------
  const loadQueue = useCallback(async () => {
    if (!companyId) return;
    setIsLoading(true);
    setError(null);
    try {
      const { data, error: pErr } = await supabase
        .from("pieces_tasks")
        .select("*, projects(name, code, due_date, clients(name))")
        .eq("company_id", companyId)
        .in("production_status", ["sent", "in_preparation"])
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
          primary_operation_type: row.primary_operation_type as string | null,
          production_status: row.production_status as ProductionStatus,
          project_id: row.project_id as string,
          project_name: proj?.name ?? "—",
          project_code: proj?.code ?? "—",
          client_name: proj?.clients?.name ?? null,
          due_date: proj?.due_date ?? null,
          manufacturing_order_id: row.manufacturing_order_id as string | null,
        };
      });
      setPieces(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!selectedPiece || !companyId) {
      setPieceOps([]);
      setPieceDocs([]);
      setExistingOf(null);
      setDrawingUrl("");
      setDrawingPathLocal("");
      setDrawingPathNetwork("");
      setOfNotes("");
      return;
    }

    setIsLoadingDetails(true);
    setSuccessMessage(null);
    void (async () => {
      try {
        const [{ data: ops }, { data: docs }, of] = await Promise.all([
          supabase
            .from("piece_costing_operations")
            .select("id, stage, estimated_hours, hourly_rate, quantity_pieces, unit_price, stt_type, subtotal, sequence_order, label")
            .eq("company_id", companyId)
            .eq("piece_task_id", selectedPiece.id)
            .order("sequence_order"),
          supabase
            .from("piece_documents")
            .select("id, doc_type, title, url")
            .eq("company_id", companyId)
            .eq("piece_task_id", selectedPiece.id)
            .order("created_at", { ascending: false }),
          getOfByPieceId(selectedPiece.id, companyId),
        ]);

        setPieceOps((ops as OperationRow[]) ?? []);
        setPieceDocs((docs as DocumentRow[]) ?? []);
        setExistingOf(of);

        if (of) {
          setDrawingUrl(of.technical_drawing_url ?? "");
          setDrawingPathLocal(of.technical_drawing_path_local ?? "");
          setDrawingPathNetwork(of.technical_drawing_path_network ?? "");
          setOfNotes(of.notes ?? "");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur chargement détails");
      } finally {
        setIsLoadingDetails(false);
      }
    })();
  }, [selectedPiece, companyId]);

  // ---------------------------------------------------------------------
  async function handleCreateOf() {
    if (!selectedPiece || !staffUser || !companyId) return;
    setError(null);
    setIsCreatingOf(true);
    try {
      const result = await createOfFromPiece({
        companyId,
        staffId: staffUser.id,
        pieceTaskId: selectedPiece.id,
        projectId: selectedPiece.project_id,
        productName: selectedPiece.name || selectedPiece.code || "—",
        quantity: selectedPiece.quantity ?? 1,
        interfaceType: null,
      });
      setSuccessMessage(
        t("production.preparation.ofCreated", { number: result.of.order_number }),
      );
      const of = await getOfByPieceId(selectedPiece.id, companyId);
      setExistingOf(of);
      await loadQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsCreatingOf(false);
    }
  }

  async function handleSaveDrawing() {
    if (!existingOf || !companyId) return;
    setError(null);
    setIsSavingDrawing(true);
    try {
      await updateOfDrawing(existingOf.id, companyId, {
        url: drawingUrl.trim() || null,
        path_local: drawingPathLocal.trim() || null,
        path_network: drawingPathNetwork.trim() || null,
      });
      setSuccessMessage(t("production.preparation.drawingSaved"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsSavingDrawing(false);
    }
  }

  async function handleMarkReady() {
    if (!existingOf || !companyId) return;
    setError(null);
    setIsMarkingReady(true);
    try {
      await markOfReadyToPlan(existingOf.id, companyId);
      setSuccessMessage(t("production.preparation.ofReadyForPlanning"));
      await loadQueue();
      setTimeout(() => setSelectedPiece(null), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsMarkingReady(false);
    }
  }

  // ---------------------------------------------------------------------
  const canCreateOf = useMemo(
    () => !!selectedPiece && pieceOps.length > 0 && !existingOf,
    [selectedPiece, pieceOps.length, existingOf],
  );

  const opsByInterface = useMemo(() => {
    const cnc = pieceOps.filter((o) => getStageInterface(o.stage) === "cnc");
    const classique = pieceOps.filter((o) => getStageInterface(o.stage) !== "cnc");
    return { cnc, classique };
  }, [pieceOps]);

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
      {/* ─── File d'attente ─── */}
      <aside className="h-fit space-y-2">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">
            {t("production.preparation.toPrepare")} ({pieces.length})
          </h2>
        </div>
        <ul className="space-y-1.5">
          {pieces.map((p) => {
            const isActive = selectedPiece?.id === p.id;
            const hasOf = !!p.manufacturing_order_id;
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
                    {hasOf ? (
                      <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">
                        OF
                      </span>
                    ) : (
                      <ChevronRight size={14} className="mt-0.5 shrink-0 text-slate-300" />
                    )}
                  </div>
                  <div className="mt-1.5 truncate text-[10px] text-slate-400">
                    {p.project_name}
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

      {/* ─── Feuille de préparation ─── */}
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
                <Info label="Code projet" value={selectedPiece.project_code} />
                <Info
                  label={t("production.preparation.productionStatus")}
                  value={selectedPiece.production_status}
                />
              </div>
            </div>

            {successMessage && (
              <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs font-semibold text-green-700">
                <CheckCircle2 size={14} />
                {successMessage}
              </div>
            )}

            {/* ═══ MODE 1 : CRÉATION OF ═══ */}
            {!existingOf && (
              <>
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
                    <>
                      {opsByInterface.cnc.length > 0 && (
                        <div className="mb-2">
                          <div className="mb-1 text-[10px] font-bold uppercase text-amber-700">
                            CNC ({opsByInterface.cnc.length})
                          </div>
                          <OpList ops={opsByInterface.cnc} />
                        </div>
                      )}
                      {opsByInterface.classique.length > 0 && (
                        <div>
                          <div className="mb-1 text-[10px] font-bold uppercase text-blue-700">
                            Classique ({opsByInterface.classique.length})
                          </div>
                          <OpList ops={opsByInterface.classique} />
                        </div>
                      )}
                    </>
                  )}
                </div>

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
                        <li
                          key={d.id}
                          className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs"
                        >
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

                <div className="sticky bottom-4 rounded-xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-blue-50 p-4">
                  <button
                    onClick={() => void handleCreateOf()}
                    disabled={!canCreateOf || isCreatingOf}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-3 text-sm font-bold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {isCreatingOf ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <PlusCircle size={16} />
                    )}
                    {isCreatingOf
                      ? t("production.preparation.creatingOf")
                      : t("production.preparation.createOf")}
                  </button>
                  {pieceOps.length === 0 && (
                    <p className="mt-2 text-center text-[11px] text-amber-700">
                      {t("production.preparation.needOpsFirst")}
                    </p>
                  )}
                </div>
              </>
            )}

            {/* ═══ MODE 2 : OF EXISTE ═══ */}
            {existingOf && (
              <>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                      <InfoIcon size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-amber-900">
                        {t("production.preparation.ofNumberTitle", {
                          number: existingOf.order_number,
                        })}
                      </h3>
                      <p className="mt-1 text-xs text-amber-700">
                        {t("production.preparation.ofInPreparationBody")}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Cog size={15} className="text-indigo-600" />
                    <h2 className="text-sm font-bold text-slate-700">
                      {t("production.preparation.ofOperations")} ({existingOf.operations.length})
                    </h2>
                  </div>
                  {existingOf.operations.length === 0 ? (
                    <p className="rounded-lg bg-slate-50 px-3 py-3 text-center text-xs text-slate-400">
                      —
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {existingOf.operations.map((op, i) => {
                        const def = getStageDef(op.stage as never);
                        const iface = op.interface_type as "cnc" | "classique";
                        const billing = getStageBilling(op.stage);
                        const isPieceBilling = billing === "pieces";
                        const sttLabel = op.stt_type ? getSttTypeLabel(op.stt_type) : null;
                        const displaySubtotal = isPieceBilling
                          ? (op.quantity_pieces || 0) * (op.unit_price || 0)
                          : (op.estimated_hours || 0) * (op.hourly_rate || 0);
                        return (
                          <li
                            key={op.id}
                            className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs"
                          >
                            <span className="shrink-0 text-slate-400">{i + 1}</span>
                            <span className="shrink-0 text-base">{def.icon}</span>
                            <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">
                              {t(def.labelKey)}
                              {op.label && (
                                <span className="ms-1 text-slate-400">— {op.label}</span>
                              )}
                              {sttLabel && (
                                <span className="ms-1 text-slate-500">({sttLabel})</span>
                              )}
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
                            {isPieceBilling && (
                              <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-slate-800 px-1.5 py-0.5 text-[9px] font-bold text-white">
                                <Hash size={9} /> {t("costing.billingPieces")}
                              </span>
                            )}
                            <span
                              className="shrink-0 font-mono text-[10px] text-slate-500"
                              dir="ltr"
                            >
                              {isPieceBilling
                                ? `${op.quantity_pieces} pcs × ${op.unit_price ?? 0}`
                                : `${op.estimated_hours}h × ${op.hourly_rate}`}
                            </span>
                            <span className="shrink-0 font-bold text-slate-700" dir="ltr">
                              {displaySubtotal.toFixed(2)}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <Package size={15} className="text-indigo-600" />
                    <h2 className="text-sm font-bold text-slate-700">
                      {t("production.preparation.workPackages")} ({existingOf.work_packages.length})
                    </h2>
                  </div>
                  {existingOf.work_packages.length === 0 ? (
                    <p className="rounded-lg bg-slate-50 px-3 py-3 text-center text-xs text-slate-400">
                      —
                    </p>
                  ) : (
                    <ul className="space-y-1.5">
                      {existingOf.work_packages.map((wp) => (
                        <li
                          key={wp.id}
                          className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs"
                        >
                          <span
                            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              wp.interface_type === "cnc"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-blue-100 text-blue-700"
                            }`}
                          >
                            {String(wp.interface_type).toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-slate-700">
                            {wp.label ?? "—"}
                          </span>
                          <span className="shrink-0 text-[10px] font-semibold text-slate-500">
                            {wp.status}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <FilePlus2 size={15} className="text-indigo-600" />
                    <h2 className="text-sm font-bold text-slate-700">
                      {t("production.preparation.technicalDrawing")}
                    </h2>
                  </div>

                  <div className="space-y-2">
                    <Field
                      label={t("production.preparation.drawingUrl")}
                      placeholder="https://..."
                      value={drawingUrl}
                      onChange={setDrawingUrl}
                      dir="ltr"
                    />
                    <Field
                      label={t("production.preparation.drawingPathLocal")}
                      placeholder="C:\\Dessins\\..."
                      value={drawingPathLocal}
                      onChange={setDrawingPathLocal}
                      dir="ltr"
                    />
                    <Field
                      label={t("production.preparation.drawingPathNetwork")}
                      placeholder="\\\\SERVER\\Dessins\\..."
                      value={drawingPathNetwork}
                      onChange={setDrawingPathNetwork}
                      dir="ltr"
                    />
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold text-slate-500">
                        {t("production.preparation.ofNotes")}
                      </label>
                      <textarea
                        value={ofNotes}
                        onChange={(e) => setOfNotes(e.target.value)}
                        rows={2}
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
                      />
                    </div>
                  </div>

                  <button
                    onClick={() => void handleSaveDrawing()}
                    disabled={isSavingDrawing}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-700 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {isSavingDrawing ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Save size={13} />
                    )}
                    {t("common.save")}
                  </button>
                </div>

                <div className="sticky bottom-4 rounded-xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-blue-50 p-4">
                  <button
                    onClick={() => void handleMarkReady()}
                    disabled={isMarkingReady}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-3 text-sm font-bold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {isMarkingReady ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <ArrowRight size={16} />
                    )}
                    {isMarkingReady
                      ? t("production.preparation.markingReady")
                      : t("production.preparation.readyToPlan")}
                  </button>
                </div>
              </>
            )}

            {error && (
              <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
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

function OpList({ ops }: { ops: OperationRow[] }) {
  const { t } = useTranslation();
  return (
    <ul className="space-y-1">
      {ops.map((op, i) => {
        const def = getStageDef(op.stage as never);
        const billing = getStageBilling(op.stage);
        const isPieceBilling = billing === "pieces";
        const sttLabel = op.stt_type ? getSttTypeLabel(op.stt_type) : null;
        const displaySubtotal = isPieceBilling
          ? (op.quantity_pieces || 0) * (op.unit_price || 0)
          : (op.estimated_hours || 0) * (op.hourly_rate || 0);
        return (
          <li
            key={op.id}
            className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs"
          >
            <span className="shrink-0 text-slate-400">{i + 1}</span>
            <span className="shrink-0 text-sm">{def.icon}</span>
            <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">
              {t(def.labelKey)}
              {op.label && <span className="ms-1 text-slate-400">— {op.label}</span>}
              {sttLabel && <span className="ms-1 text-slate-500">({sttLabel})</span>}
            </span>
            {isPieceBilling && (
              <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-slate-800 px-1.5 py-0.5 text-[9px] font-bold text-white">
                <Hash size={9} /> {t("costing.billingPieces")}
              </span>
            )}
            <span className="shrink-0 font-mono text-[10px] text-slate-500" dir="ltr">
              {isPieceBilling
                ? `${op.quantity_pieces} pcs × ${op.unit_price ?? 0}`
                : `${op.estimated_hours}h × ${op.hourly_rate}`}
            </span>
            <span className="shrink-0 font-bold text-slate-700" dir="ltr">
              {displaySubtotal.toFixed(2)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  dir,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  dir?: "ltr" | "rtl";
}) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold text-slate-500">
        {label}
      </label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        dir={dir}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
      />
    </div>
  );
}