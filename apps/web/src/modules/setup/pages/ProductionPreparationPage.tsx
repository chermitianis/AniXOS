import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Loader2, Package, FolderOpen, FileText, Cog, AlertTriangle,
  CheckCircle2, ChevronRight, ChevronDown, ArrowRight, Info as InfoIcon,
  Save, FilePlus2, PlusCircle, Hash, FolderTree,
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

interface TechnicalPieceRow {
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
  parent_piece_id: string | null;
  piece_type: string;
}

interface OperationRow {
  id: string;
  name: string;
  code: string | null;
  piece_type: string;
  parent_piece_id: string | null;
  estimated_time_minutes: number | null;
  status: string;
  odoo_workorder_id: number | null;
}

interface DocumentRow {
  id: string;
  doc_type: string;
  title: string;
  url: string;
}

interface GroupedProject {
  project_id: string;
  project_name: string;
  project_code: string;
  client_name: string | null;
  due_date: string | null;
  pieces: (TechnicalPieceRow & { operations: OperationRow[] })[];
}

// ---------------------------------------------------------------------------
export function ProductionPreparationPage() {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();
  const companyId = staffUser?.company_id ?? null;

  const [projects, setProjects] = useState<GroupedProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ✅ التحديد الآن يتم على مستوى "القطعة التقنية" وليس المشروع
  const [selectedPiece, setSelectedPiece] = useState<TechnicalPieceRow | null>(null);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [expandedPieces, setExpandedPieces] = useState<Set<string>>(new Set());

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
  // ✅ تحميل الشجرة (Project -> Technical Pieces -> Operations)
  // ---------------------------------------------------------------------
  const loadTree = useCallback(async () => {
    if (!companyId) return;
    setIsLoading(true);
    setError(null);
    try {
      // 1. جلب القطع التقنية فقط (piece_type = 'technical_piece')
      const { data: piecesData, error: pErr } = await supabase
        .from("pieces_tasks")
        .select("*, projects(name, code, due_date, clients(name))")
        .eq("company_id", companyId)
        .eq("piece_type", "technical_piece")
        .in("production_status", ["sent", "in_preparation"])
        .order("created_at", { ascending: false });

      if (pErr) throw pErr;

      const technicalPieces: TechnicalPieceRow[] = ((piecesData ?? []) as Record<string, unknown>[]).map((row) => {
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
          parent_piece_id: row.parent_piece_id as string | null,
          piece_type: row.piece_type as string,
        };
      });

      // 2. جلب العمليات التابعة لهذه القطع (piece_type = 'operation')
      const pieceIds = technicalPieces.map((p) => p.id);
      let operations: OperationRow[] = [];
      
      if (pieceIds.length > 0) {
        const { data: opsData, error: oErr } = await supabase
          .from("pieces_tasks")
          .select("id, name, code, piece_type, parent_piece_id, estimated_time_minutes, status, odoo_workorder_id")
          .eq("company_id", companyId)
          .eq("piece_type", "operation")
          .in("parent_piece_id", pieceIds)
          .order("created_at", { ascending: true });

        if (oErr) throw oErr;
        operations = (opsData ?? []) as OperationRow[];
      }

      // 3. تجميع البيانات: Project -> Pieces -> Operations
      const projectMap = new Map<string, GroupedProject>();

      for (const piece of technicalPieces) {
        // ربط العمليات بالقطعة
        const pieceOps = operations.filter((op) => op.parent_piece_id === piece.id);

        // البحث عن المشروع أو إنشاؤه
        if (!projectMap.has(piece.project_id)) {
          projectMap.set(piece.project_id, {
            project_id: piece.project_id,
            project_name: piece.project_name,
            project_code: piece.project_code,
            client_name: piece.client_name,
            due_date: piece.due_date,
            pieces: [],
          });
        }

        // إضافة القطعة التقنية إلى المشروع
        projectMap.get(piece.project_id)!.pieces.push({
          ...piece,
          operations: pieceOps,
        });
      }

      setProjects(Array.from(projectMap.values()));

      // توسيع جميع المشاريع افتراضياً
      setExpandedProjects(new Set(projectMap.keys()));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void loadTree();
  }, [loadTree]);

  // ---------------------------------------------------------------------
  // عند تحديد قطعة تقنية، نجلب تفاصيلها (OF، مستندات...)
  // ---------------------------------------------------------------------
  useEffect(() => {
    if (!selectedPiece || !companyId) {
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
        const [{ data: docs }, of] = await Promise.all([
          supabase
            .from("piece_documents")
            .select("id, doc_type, title, url")
            .eq("company_id", companyId)
            .eq("piece_task_id", selectedPiece.id)
            .order("created_at", { ascending: false }),
          getOfByPieceId(selectedPiece.id, companyId),
        ]);

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
  // Actions
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
      await loadTree();
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
      await loadTree();
      setTimeout(() => setSelectedPiece(null), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsMarkingReady(false);
    }
  }

  // ---------------------------------------------------------------------
  // UI Helpers
  // ---------------------------------------------------------------------
  function toggleProject(projectId: string) {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }

  function togglePiece(pieceId: string) {
    setExpandedPieces((prev) => {
      const next = new Set(prev);
      if (next.has(pieceId)) next.delete(pieceId);
      else next.add(pieceId);
      return next;
    });
  }

  const canCreateOf = useMemo(
    () => !!selectedPiece && !existingOf,
    [selectedPiece, existingOf],
  );

  // ---------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Loader2 className="me-2 animate-spin" size={18} />
        {t("common.loading")}
      </div>
    );
  }

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------
  return (
    <div className="grid gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
      {/* ─── القائمة الجانبية: شجرة المشاريع ─── */}
      <aside className="h-fit space-y-2">
        <div className="mb-2 flex items-center justify-between px-1">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">
            {t("production.preparation.toPrepare", { defaultValue: "À préparer" })} ({projects.reduce((acc, p) => acc + p.pieces.length, 0)})
          </h2>
        </div>
        <ul className="space-y-1.5">
          {projects.map((proj) => {
            const isProjExpanded = expandedProjects.has(proj.project_id);
            return (
              <li key={proj.project_id} className="rounded-xl border border-slate-200 bg-white">
                {/* رأس المشروع */}
                <button
                  type="button"
                  onClick={() => toggleProject(proj.project_id)}
                  className="flex w-full items-center gap-2 rounded-t-xl px-3 py-2.5 text-start transition-colors hover:bg-slate-50"
                >
                  {isProjExpanded ? <ChevronDown size={14} className="shrink-0 text-slate-400" /> : <ChevronRight size={14} className="shrink-0 text-slate-400" />}
                  <FolderTree size={14} className="shrink-0 text-indigo-500" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-slate-800">{proj.project_name}</div>
                    <div className="mt-0.5 truncate font-mono text-[10px] text-slate-400" dir="ltr">{proj.project_code}</div>
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-600">
                    {proj.pieces.length}
                  </span>
                </button>

                {/* القطع التقنية داخل المشروع */}
                {isProjExpanded && (
                  <ul className="border-t border-slate-100 bg-slate-50/50 p-1.5 space-y-1">
                    {proj.pieces.map((piece) => {
                      const isSelected = selectedPiece?.id === piece.id;
                      const hasOf = !!piece.manufacturing_order_id;
                      const isPieceExpanded = expandedPieces.has(piece.id);

                      return (
                        <li key={piece.id} className="rounded-lg bg-white border border-slate-200 overflow-hidden">
                          {/* رأس القطعة التقنية */}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedPiece(piece);
                              togglePiece(piece.id);
                            }}
                            className={`flex w-full items-start gap-2 px-2.5 py-2 text-start transition-colors ${
                              isSelected ? "bg-indigo-50 border-indigo-200" : "hover:bg-slate-50"
                            }`}
                          >
                            {isPieceExpanded ? <ChevronDown size={12} className="mt-0.5 shrink-0 text-slate-400" /> : <ChevronRight size={12} className="mt-0.5 shrink-0 text-slate-400" />}
                            <Package size={14} className={`mt-0.5 shrink-0 ${isSelected ? "text-indigo-600" : "text-slate-400"}`} />
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-xs font-bold text-slate-800">{piece.name}</div>
                              <div className="mt-0.5 truncate font-mono text-[9px] text-slate-400" dir="ltr">{piece.code ?? "—"}</div>
                            </div>
                            {hasOf && (
                              <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">OF</span>
                            )}
                          </button>

                          {/* العمليات داخل القطعة التقنية */}
                          {isPieceExpanded && piece.operations.length > 0 && (
                            <ul className="border-t border-slate-100 bg-slate-50/30 px-2 py-1 space-y-0.5">
                              {piece.operations.map((op) => (
                                <li key={op.id} className="flex items-center gap-1.5 px-2 py-1 text-[10px] text-slate-600">
                                  <span className="h-1 w-1 rounded-full bg-indigo-400 shrink-0" />
                                  <span className="font-semibold truncate">{op.name}</span>
                                  {op.estimated_time_minutes && (
                                    <span className="ml-auto font-mono text-slate-400 shrink-0">
                                      {op.estimated_time_minutes}min
                                    </span>
                                  )}
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
          {projects.length === 0 && (
            <li className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-8 text-center text-xs text-slate-400">
              {t("production.preparation.emptyQueue", { defaultValue: "Aucune pièce à préparer" })}
            </li>
          )}
        </ul>
      </aside>

      {/* ─── منطقة التفاصيل (اليمين) ─── */}
      <div className="space-y-4">
        {!selectedPiece ? (
          <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-400">
            <FolderOpen size={32} className="mx-auto mb-2 text-slate-300" />
            {t("production.preparation.selectPiece", { defaultValue: "Sélectionnez une pièce pour préparer" })}
          </div>
        ) : (
          <>
            {/* رأس القطعة التقنية المحددة */}
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Package size={16} className="text-indigo-600" />
                  <h1 className="text-base font-extrabold text-slate-800">{selectedPiece.name || "—"}</h1>
                  <span className="font-mono text-xs text-slate-400" dir="ltr">{selectedPiece.code ?? "—"}</span>
                </div>
                <Badge variant={selectedPiece.production_status === "in_preparation" ? "warning" : "info"} size="sm">
                  {selectedPiece.production_status}
                </Badge>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                <Info label={t("setup.projectLabel", { defaultValue: "Projet" })} value={selectedPiece.project_name} />
                <Info label={t("setup.client", { defaultValue: "Client" })} value={selectedPiece.client_name ?? "—"} />
                <Info label={t("setup.quantity", { defaultValue: "Quantité" })} value={String(selectedPiece.quantity ?? 1)} />
                <Info label={t("production.preparation.deadline", { defaultValue: "Échéance" })} value={selectedPiece.due_date ? new Date(selectedPiece.due_date).toLocaleDateString("fr-FR") : "—"} />
                <Info label={t("production.preparation.estimatedTime", { defaultValue: "Temps estimé" })} value={selectedPiece.estimated_time_minutes ? `${Math.floor(selectedPiece.estimated_time_minutes / 60)}h${selectedPiece.estimated_time_minutes % 60}` : "—"} />
                <Info label="Code projet" value={selectedPiece.project_code} />
              </div>
            </div>

            {/* العمليات التابعة (كقائمة مسطحة في المنطقة اليمنى) */}
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="mb-3 flex items-center gap-2">
                <Cog size={15} className="text-indigo-600" />
                <h2 className="text-sm font-bold text-slate-700">
                  {t("production.preparation.operations", { defaultValue: "Opérations" })}
                </h2>
              </div>
              {isLoadingDetails ? (
                <Loader2 size={16} className="mx-auto animate-spin text-slate-300" />
              ) : (
                <ul className="space-y-1">
                  {projects
                    .flatMap((p) => p.pieces)
                    .find((p) => p.id === selectedPiece.id)
                    ?.operations.map((op, i) => (
                      <li key={op.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                        <span className="shrink-0 text-slate-400">{i + 1}</span>
                        <span className="min-w-0 flex-1 font-semibold text-slate-700">{op.name}</span>
                        {op.estimated_time_minutes && (
                          <span className="shrink-0 font-mono text-[10px] text-slate-500" dir="ltr">
                            {op.estimated_time_minutes} min
                          </span>
                        )}
                      </li>
                    ))}
                </ul>
              )}
            </div>

            {/* معلومات OF (إن وجد) أو زر إنشاء OF */}
            {existingOf ? (
              <>
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                      <InfoIcon size={20} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h3 className="text-sm font-bold text-amber-900">
                        {t("production.preparation.ofNumberTitle", { defaultValue: `OF: ${existingOf.order_number}` })}
                      </h3>
                      <p className="mt-1 text-xs text-amber-700">
                        {t("production.preparation.ofInPreparationBody", { defaultValue: "En préparation" })}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex items-center gap-2">
                    <FilePlus2 size={15} className="text-indigo-600" />
                    <h2 className="text-sm font-bold text-slate-700">
                      {t("production.preparation.technicalDrawing", { defaultValue: "Dessin technique" })}
                    </h2>
                  </div>
                  <div className="space-y-2">
                    <Field label={t("production.preparation.drawingUrl", { defaultValue: "URL" })} placeholder="https://..." value={drawingUrl} onChange={setDrawingUrl} dir="ltr" />
                    <Field label={t("production.preparation.drawingPathLocal", { defaultValue: "Chemin local" })} placeholder="C:\\Dessins\\..." value={drawingPathLocal} onChange={setDrawingPathLocal} dir="ltr" />
                    <Field label={t("production.preparation.drawingPathNetwork", { defaultValue: "Chemin réseau" })} placeholder="\\\\SERVER\\Dessins\\..." value={drawingPathNetwork} onChange={setDrawingPathNetwork} dir="ltr" />
                    <div>
                      <label className="mb-1 block text-[11px] font-semibold text-slate-500">{t("production.preparation.ofNotes", { defaultValue: "Notes" })}</label>
                      <textarea value={ofNotes} onChange={(e) => setOfNotes(e.target.value)} rows={2} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
                    </div>
                  </div>
                  <button onClick={() => void handleSaveDrawing()} disabled={isSavingDrawing} className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-slate-700 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:opacity-50">
                    {isSavingDrawing ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                    {t("common.save", { defaultValue: "Enregistrer" })}
                  </button>
                </div>

                <div className="sticky bottom-4 rounded-xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-blue-50 p-4">
                  <button onClick={() => void handleMarkReady()} disabled={isMarkingReady} className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-3 text-sm font-bold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50">
                    {isMarkingReady ? <Loader2 size={16} className="animate-spin" /> : <ArrowRight size={16} />}
                    {isMarkingReady ? t("production.preparation.markingReady", { defaultValue: "En cours..." }) : t("production.preparation.readyToPlan", { defaultValue: "Prêt pour planification" })}
                  </button>
                </div>
              </>
            ) : (
              <div className="sticky bottom-4 rounded-xl border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-blue-50 p-4">
                <button onClick={() => void handleCreateOf()} disabled={!canCreateOf || isCreatingOf} className="flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 py-3 text-sm font-bold text-white transition-colors hover:bg-indigo-700 disabled:opacity-50">
                  {isCreatingOf ? <Loader2 size={16} className="animate-spin" /> : <PlusCircle size={16} />}
                  {isCreatingOf ? t("production.preparation.creatingOf", { defaultValue: "Création..." }) : t("production.preparation.createOf", { defaultValue: "Créer OF" })}
                </button>
              </div>
            )}

            {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}
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
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 truncate text-sm font-semibold text-slate-700">{value}</div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, dir }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; dir?: "ltr" | "rtl"; }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold text-slate-500">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} dir={dir} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100" />
    </div>
  );
}

function Badge({ variant, size, children }: { variant: "info" | "warning" | "success" | "danger" | "neutral"; size: "sm" | "md"; children: React.ReactNode }) {
  const colors = {
    info: "bg-blue-100 text-blue-700",
    warning: "bg-amber-100 text-amber-700",
    success: "bg-emerald-100 text-emerald-700",
    danger: "bg-red-100 text-red-700",
    neutral: "bg-slate-100 text-slate-700",
  };
  const sizes = { sm: "text-[10px] px-2 py-0.5", md: "text-xs px-2.5 py-1" };
  return <span className={`inline-flex items-center rounded-full font-bold ${colors[variant]} ${sizes[size]}`}>{children}</span>;
}