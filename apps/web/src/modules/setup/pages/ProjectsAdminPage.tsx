import { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Loader2, Search, Package, ChevronRight, ChevronDown, FolderTree,
  ClipboardCheck, CheckCircle2, FileSpreadsheet, Boxes,
} from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { useNav } from "../../../app/NavContext";
import { deriveProjectStatus } from "../../production/api/projectsStatusApi";
import type { Project, PieceTask, Client } from "../../../shared/types/database";

type ClientWithCode = Client & { code: string | null };
type StatusTab = "all" | "draft" | "studying" | "approved";
type CostingStatus = "non_etudie" | "brouillon" | "en_attente" | "valide";
type ProductionStatus =
  | "not_sent" | "sent" | "in_preparation" | "ready_to_start"
  | "scheduled" | "in_progress" | "partially_done" | "completed" | "on_hold";

type PieceType = "technical_piece" | "operation";

type PieceWithStatus = PieceTask & {
  costing_status: CostingStatus;
  production_status: ProductionStatus;
  piece_type: PieceType;
  parent_piece_id: string | null;
};

interface OperationNode extends PieceWithStatus {}

interface TechnicalPieceNode extends PieceWithStatus {
  operations: OperationNode[];
}

interface MainProductNode extends PieceWithStatus {
  technical_pieces: TechnicalPieceNode[];
}

interface ProjectTree extends Project {
  main_products: MainProductNode[];
}

const STATUS_TABS: { key: StatusTab; labelKey: string }[] = [
  { key: "all", labelKey: "setup.tabAll" },
  { key: "draft", labelKey: "setup.tabDraft" },
  { key: "studying", labelKey: "setup.tabStudying" },
  { key: "approved", labelKey: "setup.tabApproved" },
];

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  studying: "bg-amber-100 text-amber-700",
  approved: "bg-blue-100 text-blue-700",
};

const STATUS_LABEL_KEYS: Record<string, string> = {
  draft: "setup.statusDraft",
  studying: "setup.statusStudying",
  approved: "setup.statusApproved",
};

const COSTING_BADGE: Record<CostingStatus, { labelKey: string; cls: string }> = {
  non_etudie: { labelKey: "setup.costingNotStudied", cls: "bg-slate-100 text-slate-600" },
  brouillon:  { labelKey: "setup.costingDraft",      cls: "bg-amber-100 text-amber-700" },
  en_attente: { labelKey: "setup.costingPending",    cls: "bg-blue-100 text-blue-700" },
  valide:     { labelKey: "setup.costingValidated",  cls: "bg-green-100 text-green-700" },
};

const PROD_BADGE: Record<string, { labelKey: string; cls: string }> = {
  not_sent:        { labelKey: "setup.prodNotSent",        cls: "bg-slate-100 text-slate-600" },
  sent:            { labelKey: "setup.prodSent",           cls: "bg-indigo-100 text-indigo-700" },
  in_preparation:  { labelKey: "setup.prodInPreparation",  cls: "bg-amber-100 text-amber-700" },
  ready_to_start:  { labelKey: "setup.prodReadyToStart",   cls: "bg-blue-100 text-blue-700" },
  scheduled:       { labelKey: "setup.prodScheduled",      cls: "bg-purple-100 text-purple-700" },
  in_progress:     { labelKey: "setup.prodInProgress",     cls: "bg-indigo-100 text-indigo-700" },
  partially_done:  { labelKey: "setup.prodPartiallyDone",  cls: "bg-amber-100 text-amber-700" },
  completed:       { labelKey: "setup.prodCompleted",      cls: "bg-green-100 text-green-700" },
  on_hold:         { labelKey: "setup.prodOnHold",         cls: "bg-orange-100 text-orange-700" },
};

function matchesTab(status: string, tab: StatusTab): boolean {
  if (tab === "all") return true;
  return status === tab;
}

function formatMinutesAsHM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

export function ProjectsAdminPage({ onNavigate }: { onNavigate?: (key: string) => void }) {
  const { staffUser } = useStaffAuth();
  const { t } = useTranslation();
  const { consumeParams } = useNav();
  const companyId = staffUser?.company_id ?? null;

  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<ClientWithCode[]>([]);
  const [projectTrees, setProjectTrees] = useState<Record<string, ProjectTree>>({});
  
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());
  const [expandedMainProducts, setExpandedMainProducts] = useState<Set<string>>(new Set());
  const [expandedTechnicalPieces, setExpandedTechnicalPieces] = useState<Set<string>>(new Set());

  const [statusTab, setStatusTab] = useState<StatusTab>("all");
  const [search, setSearch] = useState("");
  const [busyPieceId, setBusyPieceId] = useState<string | null>(null);
  
  const [initialProjectId, setInitialProjectId] = useState<string | null>(null);

  // ✅ قراءة projectId من navigation params (مرة واحدة فقط)
  useEffect(() => {
    const params = consumeParams();
    if (params?.projectId) {
      setInitialProjectId(params.projectId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -----------------------------------------------------------------------
  // تحميل المشاريع والعملاء
  // -----------------------------------------------------------------------
  async function loadProjects() {
    if (!companyId) return;
    const { data } = await supabase
      .from("projects")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_archived", false)
      .in("status", ["draft", "studying", "approved"])
      .order("created_at", { ascending: false });
    setProjects((data as Project[]) ?? []);
  }

  async function loadClients() {
    if (!companyId) return;
    const { data } = await supabase
      .from("clients")
      .select("*")
      .eq("company_id", companyId)
      .order("name");
    setClients((data as ClientWithCode[]) ?? []);
  }

  // ✅ تحميل الشجرة
  async function loadProjectTree(projectId: string) {
    if (!companyId) return;

    const { data: allPieces } = await supabase
      .from("pieces_tasks")
      .select("*")
      .eq("company_id", companyId)
      .eq("project_id", projectId)
      .order("sequence_order");

    const pieces = (allPieces as PieceWithStatus[]) ?? [];

    // 3 مستويات: main_products (parent_piece_id = null) -> technical_pieces -> operations
    const mainProducts = pieces.filter((p) => p.piece_type === "technical_piece" && !p.parent_piece_id);
    const technicalPieces = pieces.filter((p) => p.piece_type === "technical_piece" && p.parent_piece_id);
    const operations = pieces.filter((p) => p.piece_type === "operation");

    const mainProductNodes: MainProductNode[] = mainProducts.map((mp) => {
      const tpNodes: TechnicalPieceNode[] = technicalPieces
        .filter((tp) => tp.parent_piece_id === mp.id)
        .map((tp) => ({
          ...tp,
          operations: operations.filter((op) => op.parent_piece_id === tp.id),
        }));

      return {
        ...mp,
        technical_pieces: tpNodes,
      };
    });

    setProjectTrees((prev) => ({
      ...prev,
      [projectId]: {
        ...projects.find((p) => p.id === projectId)!,
        main_products: mainProductNodes,
      },
    }));
  }

  useEffect(() => {
    void loadProjects();
    void loadClients();
  }, [companyId]);

  useEffect(() => {
    for (const p of projects) {
      if (!projectTrees[p.id]) void loadProjectTree(p.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

  // ✅ فتح المشروع المحدد تلقائياً بعد تحميل الشجرة
  useEffect(() => {
    if (initialProjectId && projectTrees[initialProjectId]) {
      setExpandedProjects((prev) => new Set(prev).add(initialProjectId));
    }
  }, [initialProjectId, projectTrees]);

  // -----------------------------------------------------------------------
  // Actions
  // -----------------------------------------------------------------------
  async function handleStudyPiece(piece: PieceWithStatus) {
    if (!companyId) return;
    setBusyPieceId(piece.id);
    try {
      await supabase
        .from("pieces_tasks")
        .update({ costing_status: "en_attente" } as never)
        .eq("id", piece.id)
        .eq("company_id", companyId);

      const { data: existingNom } = await supabase
        .from("nomenclatures")
        .select("id")
        .eq("company_id", companyId)
        .eq("project_id", piece.project_id)
        .maybeSingle();
      if (!existingNom) {
        await supabase.from("nomenclatures").insert({
          company_id: companyId,
          project_id: piece.project_id,
          name: "",
          created_by: staffUser?.id,
        } as never);
      }

      await loadProjectTree(piece.project_id);
      await deriveProjectStatus(piece.project_id, companyId);
      await loadProjects();
    } finally {
      setBusyPieceId(null);
    }
  }

  function toggleProject(projectId: string) {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  }

  function toggleMainProduct(id: string) {
    setExpandedMainProducts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleTechnicalPiece(id: string) {
    setExpandedTechnicalPieces((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // -----------------------------------------------------------------------
  // Filtering
  // -----------------------------------------------------------------------
  const searchedProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) => p.name.toLowerCase().includes(q) || (p.code ?? "").toLowerCase().includes(q),
    );
  }, [projects, search]);

  const filteredProjects = useMemo(
    () => searchedProjects.filter((p) => matchesTab(p.status, statusTab)),
    [searchedProjects, statusTab],
  );

  const countByTab = (tab: StatusTab) =>
    tab === "all"
      ? searchedProjects.length
      : searchedProjects.filter((p) => matchesTab(p.status, tab)).length;

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold text-slate-800">
          {t("setup.projectsToStudy", { defaultValue: "Projets à étudier" })}
        </h1>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
          {filteredProjects.length}
        </span>
        <div className="relative ms-auto max-w-xs flex-1">
          <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("common.search")}
            className="w-full rounded-lg border border-slate-300 py-2 ps-8 pe-3 text-xs focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {STATUS_TABS.map((tab) => {
          const active = statusTab === tab.key;
          const count = countByTab(tab.key);
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatusTab(tab.key)}
              className={`shrink-0 whitespace-nowrap px-3 py-2 text-xs font-semibold transition-colors ${
                active
                  ? "border-b-2 border-blue-600 text-blue-600"
                  : "text-slate-400 hover:text-slate-600"
              }`}
            >
              {t(tab.labelKey)}
              <span
                className={`ms-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${
                  active ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3 sm:p-4">
        <ul className="flex flex-col gap-3">
          {filteredProjects.map((p) => {
            const client = clients.find((c) => c.id === p.client_id);
            const tree = projectTrees[p.id];
            const isExpanded = expandedProjects.has(p.id);
            const mainProducts = tree?.main_products ?? [];
            const totalTechPieces = mainProducts.reduce((sum, mp) => sum + mp.technical_pieces.length, 0);
            const totalOps = mainProducts.reduce((sum, mp) => sum + mp.technical_pieces.reduce((s, tp) => s + tp.operations.length, 0), 0);

            return (
              <li key={p.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                {/* رأس المشروع */}
                <div className="flex items-start justify-between gap-2">
                  <button
                    onClick={() => toggleProject(p.id)}
                    className="flex flex-1 items-start gap-2 text-start"
                  >
                    {isExpanded ? <ChevronDown size={16} className="mt-0.5 shrink-0 text-slate-400" /> : <ChevronRight size={16} className="mt-0.5 shrink-0 text-slate-400" />}
                    <FolderTree size={16} className="mt-0.5 shrink-0 text-indigo-500" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-slate-700">{p.name}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <span dir="ltr" className="font-mono">{p.code ?? "—"}</span>
                        {client && <span>· {client.name}</span>}
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLES[p.status] ?? "bg-slate-100 text-slate-500"}`}>
                          {t(STATUS_LABEL_KEYS[p.status] ?? p.status)}
                        </span>
                        {mainProducts.length > 0 && (
                          <span className="text-indigo-600">
                            · {mainProducts.length} produit(s) · {totalTechPieces} pièce(s) tech. · {totalOps} opération(s)
                          </span>
                        )}
                      </div>
                    </div>
                  </button>

                  <button
                    onClick={() => {
                      if (onNavigate) onNavigate("nomenclature");
                      else window.location.hash = "#/nomenclature";
                    }}
                    className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-indigo-700"
                  >
                    <FileSpreadsheet size={11} />
                    {t("setup.createNomenclature", { defaultValue: "Créer nomenclature" })}
                  </button>
                </div>

                {/* الشجرة */}
                {isExpanded && (
                  <div className="mt-3 border-t border-slate-200 pt-3">
                    <p className="mb-2 text-xs font-semibold text-slate-500">
                      {t("setup.mainProducts", { defaultValue: "Produits principaux" })}
                    </p>
                    <ul className="flex flex-col gap-2">
                      {mainProducts.map((mp) => {
                        const isMpExpanded = expandedMainProducts.has(mp.id);
                        const costing = COSTING_BADGE[mp.costing_status] ?? COSTING_BADGE.non_etudie;
                        const prod = PROD_BADGE[mp.production_status] ?? PROD_BADGE.not_sent;
                        const busy = busyPieceId === mp.id;
                        const canStudy = mp.costing_status === "non_etudie";

                        return (
                          <li key={mp.id} className="rounded-lg border border-indigo-200 bg-indigo-50/30 overflow-hidden">
                            <div className="flex flex-wrap items-center gap-2 px-3 py-2">
                              <button
                                onClick={() => toggleMainProduct(mp.id)}
                                className="flex items-center gap-1 text-slate-500 hover:text-slate-700"
                              >
                                {isMpExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                              </button>
                              <Boxes size={14} className="shrink-0 text-indigo-600" />
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="truncate font-semibold text-slate-700">{mp.name}</span>
                                  <span className="shrink-0 font-mono text-[10px] text-slate-400" dir="ltr">
                                    {mp.code ?? "—"}
                                  </span>
                                </div>
                                {mp.technical_pieces.length > 0 && (
                                  <div className="mt-0.5 text-[10px] text-slate-400">
                                    {mp.technical_pieces.length} pièce(s) technique(s)
                                  </div>
                                )}
                              </div>

                              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${costing.cls}`}>
                                {t(costing.labelKey)}
                              </span>
                              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${prod.cls}`}>
                                {t(prod.labelKey)}
                              </span>

                              {canStudy && (
                                <button
                                  onClick={() => void handleStudyPiece(mp)}
                                  disabled={busy}
                                  className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-amber-600 disabled:opacity-50"
                                >
                                  {busy ? <Loader2 size={11} className="animate-spin" /> : <ClipboardCheck size={11} />}
                                  {t("setup.studyProject")}
                                </button>
                              )}
                            </div>

                            {isMpExpanded && (
                              <ul className="border-t border-indigo-100 bg-white/50 px-3 py-2 space-y-1.5">
                                {mp.technical_pieces.map((tp) => {
                                  const isTpExpanded = expandedTechnicalPieces.has(tp.id);
                                  const tpCosting = COSTING_BADGE[tp.costing_status] ?? COSTING_BADGE.non_etudie;
                                  const tpProd = PROD_BADGE[tp.production_status] ?? PROD_BADGE.not_sent;

                                  return (
                                    <li key={tp.id} className="rounded border border-slate-200 bg-white overflow-hidden">
                                      <div className="flex items-center gap-2 px-2.5 py-1.5">
                                        <button
                                          onClick={() => toggleTechnicalPiece(tp.id)}
                                          className="text-slate-400 hover:text-slate-600"
                                        >
                                          {isTpExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                                        </button>
                                        <Package size={12} className="shrink-0 text-slate-500" />
                                        <span className="flex-1 truncate text-xs font-semibold text-slate-700">{tp.name}</span>
                                        <span className="shrink-0 font-mono text-[10px] text-slate-400" dir="ltr">{tp.code ?? "—"}</span>
                                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${tpCosting.cls}`}>
                                          {t(tpCosting.labelKey)}
                                        </span>
                                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${tpProd.cls}`}>
                                          {t(tpProd.labelKey)}
                                        </span>
                                      </div>

                                      {isTpExpanded && tp.operations.length > 0 && (
                                        <ul className="border-t border-slate-100 bg-slate-50/30 px-2 py-1.5 space-y-1">
                                          {tp.operations.map((op) => (
                                            <li key={op.id} className="flex items-center gap-2 text-[11px]">
                                              <span className="h-1.5 w-1.5 rounded-full bg-indigo-400 shrink-0" />
                                              <span className="font-medium text-slate-700 truncate">{op.name}</span>
                                              {op.estimated_time_minutes && (
                                                <span className="text-[10px] text-slate-400 font-mono" dir="ltr">
                                                  {formatMinutesAsHM(op.estimated_time_minutes)}
                                                </span>
                                              )}
                                            </li>
                                          ))}
                                        </ul>
                                      )}
                                    </li>
                                  );
                                })}
                                {mp.technical_pieces.length === 0 && (
                                  <li className="text-xs text-slate-400">{t("setup.noPiecesYet")}</li>
                                )}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                      {mainProducts.length === 0 && (
                        <li className="text-xs text-slate-400">{t("setup.noPiecesYet")}</li>
                      )}
                    </ul>
                  </div>
                )}
              </li>
            );
          })}

          {filteredProjects.length === 0 && (
            <li className="py-6 text-center text-sm text-slate-400">{t("setup.noDataYet")}</li>
          )}
        </ul>
      </div>
    </div>
  );
}