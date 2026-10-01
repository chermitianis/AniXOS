import { useEffect, useState, useMemo, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  Loader2, X, Plus, ClipboardCheck, CheckCircle2,
  AlertTriangle, Send, Search, Package, Tag, RotateCcw,
} from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { AdminField, adminInputClass } from "../components/AdminField";
import { ProjectReportModal } from "../components/ProjectReportModal";
import { PiecesInput, type PieceDraft } from "../../../shared/components/PiecesInput";
import { generateProjectCode, generatePieceCode } from "../../../shared/utils/codes";
import { deriveProjectStatus } from "../../production/api/projectsStatusApi";
import type { Project, PieceTask, Client } from "../../../shared/types/database";

type ClientWithCode = Client & { code: string | null };
type StatusTab = "all" | "draft" | "studying" | "approved" | "in_production" | "completed";
type CostingStatus = "non_etudie" | "brouillon" | "en_attente" | "valide";
type ProductionStatus =
  | "not_sent" | "sent" | "in_preparation" | "ready_to_start"
  | "scheduled" | "in_progress" | "partially_done" | "completed" | "on_hold";

type PieceWithStatus = PieceTask & {
  costing_status: CostingStatus;
  production_status: ProductionStatus;
};

const STATUS_TABS: { key: StatusTab; labelKey: string }[] = [
  { key: "all",            labelKey: "setup.tabAll" },
  { key: "draft",          labelKey: "setup.tabDraft" },
  { key: "studying",       labelKey: "setup.tabStudying" },
  { key: "approved",       labelKey: "setup.tabApproved" },
  { key: "in_production",  labelKey: "setup.tabInProduction" },
  { key: "completed",      labelKey: "setup.tabCompleted" },
];

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-slate-100 text-slate-600",
  studying: "bg-amber-100 text-amber-700",
  approved: "bg-blue-100 text-blue-700",
  ready_for_production: "bg-indigo-100 text-indigo-700",
  in_production: "bg-indigo-100 text-indigo-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-600",
};

const STATUS_LABEL_KEYS: Record<string, string> = {
  draft: "setup.statusDraft",
  studying: "setup.statusStudying",
  approved: "setup.statusApproved",
  ready_for_production: "setup.statusReadyForProduction",
  completed: "setup.statusCompleted",
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
  if (tab === "in_production")
    return status === "ready_for_production" || status === "in_production";
  return status === tab;
}

function formatMinutesAsHM(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}

export function ProjectsAdminPage() {
  const { staffUser } = useStaffAuth();
  const { t } = useTranslation();
  const companyId = staffUser?.company_id ?? null;

  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<ClientWithCode[]>([]);
  const [piecesByProject, setPiecesByProject] = useState<Record<string, PieceWithStatus[]>>({});
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [reportProjectId, setReportProjectId] = useState<string | null>(null);

  const [statusTab, setStatusTab] = useState<StatusTab>("all");
  const [search, setSearch] = useState("");

  // Modal création
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [newClientId, setNewClientId] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newPieces, setNewPieces] = useState<PieceDraft[]>([]);
  const [codePreview, setCodePreview] = useState<string | null>(null);
  const [isCodeLoading, setIsCodeLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [duplicateMatches, setDuplicateMatches] = useState<Project[] | null>(null);

  // Modal ajout pièces
  const [showPieceForm, setShowPieceForm] = useState(false);
  const [pieceProjectId, setPieceProjectId] = useState("");
  const [pieceDrafts, setPieceDrafts] = useState<PieceDraft[]>([]);
  const [isImportingPieces, setIsImportingPieces] = useState(false);

  const [busyPieceId, setBusyPieceId] = useState<string | null>(null);

  // -----------------------------------------------------------------------
  // Chargements
  // -----------------------------------------------------------------------
  async function loadProjects() {
    if (!companyId) return;
    const { data } = await supabase
      .from("projects")
      .select("*")
      .eq("company_id", companyId)
      .eq("is_archived", false)
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

  async function loadPieces(projectId: string) {
    if (!companyId) return;
    const { data } = await supabase
      .from("pieces_tasks")
      .select("*")
      .eq("company_id", companyId)
      .eq("project_id", projectId)
      .order("sequence_order");
    setPiecesByProject((prev) => ({
      ...prev,
      [projectId]: (data as PieceWithStatus[]) ?? [],
    }));
  }

  useEffect(() => {
    void loadProjects();
    void loadClients();
  }, [companyId]);

  useEffect(() => {
    if (!companyId || !newClientId) {
      setCodePreview(null);
      return;
    }
    let mounted = true;
    setIsCodeLoading(true);
    void generateProjectCode(companyId, newClientId).then((code) => {
      if (mounted) {
        setCodePreview(code);
        setIsCodeLoading(false);
      }
    });
    return () => {
      mounted = false;
    };
  }, [companyId, newClientId]);

  // Auto-expand : pour chaque projet visible, charger ses pièces
  useEffect(() => {
    for (const p of projects) {
      if (!piecesByProject[p.id]) void loadPieces(p.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projects]);

  // -----------------------------------------------------------------------
  // Création projet
  // -----------------------------------------------------------------------
  function detectDuplicates(nameToCheck: string): Project[] {
    const normalized = nameToCheck.trim().toLowerCase();
    if (!normalized) return [];
    return projects.filter((p) => p.name.trim().toLowerCase() === normalized);
  }

  function handleCreateAttempt(e: FormEvent) {
    e.preventDefault();
    setCreateError(null);
    if (!newName.trim()) { setCreateError("Le nom du projet est obligatoire."); return; }
    if (!newClientId) { setCreateError("Le client est obligatoire."); return; }
    if (newPieces.length === 0) { setCreateError("Le projet doit contenir au moins une pièce."); return; }
    const matches = detectDuplicates(newName);
    if (matches.length > 0) { setDuplicateMatches(matches); return; }
    void performCreate();
  }

  async function performCreate() {
    if (!staffUser || !companyId) return;
    setIsSaving(true);
    setCreateError(null);
    try {
      let inserted: { id: string; code: string | null } | null = null;
      let lastError: { message?: string; code?: string } | null = null;

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const finalCode = await generateProjectCode(companyId, newClientId);
        const { data, error } = await supabase
          .from("projects")
          .insert({
            company_id: companyId,
            client_id: newClientId,
            name: newName.trim(),
            code: finalCode,
            description: newNotes.trim() || null,
            due_date: newDueDate || null,
            status: "draft",
          } as never)
          .select("id, code")
          .single();

        if (!error && data) {
          inserted = data as { id: string; code: string | null };
          break;
        }
        lastError = error as { message?: string; code?: string } | null;
        if (lastError?.code !== "23505") break;
      }

      if (!inserted) {
        setCreateError(lastError?.message ?? "Erreur lors de la création.");
        return;
      }
      const projectRow = inserted;
      const projectCode = projectRow.code ?? "—";

      const pieceRows = newPieces.map((p, i) => ({
        company_id: companyId,
        project_id: projectRow.id,
        name: p.name.trim(),
        code: generatePieceCode(projectCode, i),
        sequence_order: i,
        costing_status: "non_etudie",
        production_status: "not_sent",
      }));

      const { error: piecesError } = await supabase
        .from("pieces_tasks")
        .insert(pieceRows);

      if (piecesError) {
        await supabase
          .from("projects")
          .delete()
          .eq("id", projectRow.id)
          .eq("company_id", companyId);
        setCreateError(piecesError.message);
        return;
      }

      setNewName(""); setNewClientId(""); setNewDueDate("");
      setNewNotes(""); setNewPieces([]); setCodePreview(null);
      setDuplicateMatches(null); setIsCreateOpen(false);
      await loadProjects();
      await loadPieces(projectRow.id);
    } finally {
      setIsSaving(false);
    }
  }

  // -----------------------------------------------------------------------
  // Actions PIÈCE (pas projet)
  // -----------------------------------------------------------------------

  /** Étudier : piece.non_etudie → piece.en_attente (déclenche l'entrée en étude) */
  async function handleStudyPiece(piece: PieceWithStatus) {
    if (!companyId) return;
    setBusyPieceId(piece.id);
    try {
      // Passer la pièce en 'en_attente' (état "en étude" pour le chiffrage)
      await supabase
        .from("pieces_tasks")
        .update({ costing_status: "en_attente" } as never)
        .eq("id", piece.id)
        .eq("company_id", companyId);

      // Créer une nomenclature si elle n'existe pas encore
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

      await loadPieces(piece.project_id);
      await deriveProjectStatus(piece.project_id, companyId);
      await loadProjects();
    } finally {
      setBusyPieceId(null);
    }
  }

  /** Reprendre l'étude : piece.brouillon → piece.en_attente */
  async function handleResumeStudy(piece: PieceWithStatus) {
    if (!companyId) return;
    setBusyPieceId(piece.id);
    try {
      await supabase
        .from("pieces_tasks")
        .update({ costing_status: "en_attente" } as never)
        .eq("id", piece.id)
        .eq("company_id", companyId);
      await loadPieces(piece.project_id);
      await deriveProjectStatus(piece.project_id, companyId);
      await loadProjects();
    } finally {
      setBusyPieceId(null);
    }
  }

  /** Envoyer la pièce seule en production */
  async function handleSendPieceToProduction(piece: PieceWithStatus) {
    if (!companyId) return;
    setBusyPieceId(piece.id);
    try {
      await supabase
        .from("pieces_tasks")
        .update({
          production_status: "sent",
          sent_to_production_at: new Date().toISOString(),
        } as never)
        .eq("id", piece.id)
        .eq("company_id", companyId);
      await loadPieces(piece.project_id);
      await deriveProjectStatus(piece.project_id, companyId);
      await loadProjects();
    } finally {
      setBusyPieceId(null);
    }
  }

  // -----------------------------------------------------------------------
  // Modal ajouter pièces
  // -----------------------------------------------------------------------
  function openPieceForm() {
    setPieceProjectId("");
    setPieceDrafts([]);
    setShowPieceForm(true);
  }

  async function handleAddPiecesToExisting(e: FormEvent) {
    e.preventDefault();
    if (!companyId || !pieceProjectId || pieceDrafts.length === 0) return;
    setIsImportingPieces(true);
    try {
      const { data: proj } = await supabase
        .from("projects")
        .select("code")
        .eq("id", pieceProjectId)
        .eq("company_id", companyId)
        .maybeSingle();
      const projectCode = (proj as { code: string | null } | null)?.code ?? "PRJ";
      const currentPieces = piecesByProject[pieceProjectId] ?? [];
      const offset = currentPieces.length;

      const rows = pieceDrafts.map((p, i) => ({
        company_id: companyId,
        project_id: pieceProjectId,
        name: p.name.trim(),
        code: generatePieceCode(projectCode, offset + i),
        sequence_order: offset + i,
        costing_status: "non_etudie",
        production_status: "not_sent",
      }));

      await supabase.from("pieces_tasks").insert(rows);
      setShowPieceForm(false);
      setPieceDrafts([]);
      await loadPieces(pieceProjectId);
    } finally {
      setIsImportingPieces(false);
    }
  }

  function toggleExpand(projectId: string) {
    if (expandedProjectId === projectId) {
      setExpandedProjectId(null);
    } else {
      setExpandedProjectId(projectId);
      if (!piecesByProject[projectId]) void loadPieces(projectId);
    }
  }

  async function archiveProject(projectId: string) {
    if (!companyId) return;
    await supabase
      .from("projects")
      .update({ is_archived: true, archived_at: new Date().toISOString() })
      .eq("id", projectId)
      .eq("company_id", companyId);
    await loadProjects();
  }

  // -----------------------------------------------------------------------
  // Filtrage
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

  const existingPieceNamesForModal = useMemo(() => {
    if (!pieceProjectId) return [];
    return (piecesByProject[pieceProjectId] ?? []).map((p) => p.name);
  }, [pieceProjectId, piecesByProject]);

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-bold text-white hover:bg-blue-700"
        >
          <Plus size={14} />
          {t("setup.createProject")}
        </button>
        <button
          type="button"
          onClick={openPieceForm}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
        >
          <Plus size={14} />
          {t("setup.addPiece")}
        </button>
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
            const pieces = piecesByProject[p.id] ?? [];
            const isExpanded = expandedProjectId === p.id;
            const sentCount = pieces.filter((x) =>
              ["sent", "in_preparation", "ready_to_start", "scheduled",
               "in_progress", "partially_done", "completed"].includes(x.production_status),
            ).length;
            const validatedCount = pieces.filter((x) => x.costing_status === "valide").length;

            return (
              <li key={p.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                <button
                  onClick={() => toggleExpand(p.id)}
                  className="flex w-full items-start justify-between gap-2 text-start"
                >
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-700">{p.name}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span dir="ltr" className="font-mono">{p.code ?? "—"}</span>
                      {client && <span>· {client.name}</span>}
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_STYLES[p.status] ?? "bg-slate-100 text-slate-500"}`}>
                        {t(STATUS_LABEL_KEYS[p.status] ?? p.status)}
                      </span>
                      {pieces.length > 0 && (
                        <span className="text-indigo-600">
                          · {validatedCount}/{pieces.length} validée(s) · {sentCount}/{pieces.length} envoyée(s)
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-slate-400">{isExpanded ? "▲" : "▼"}</span>
                </button>

                {p.status === "completed" && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      onClick={() => void archiveProject(p.id)}
                      className="rounded bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700"
                    >
                      {t("setup.archiveAction")}
                    </button>
                    <button
                      onClick={() => setReportProjectId(p.id)}
                      className="rounded bg-slate-800 px-3 py-1 text-xs font-semibold text-white"
                    >
                      {t("setup.viewReport")}
                    </button>
                  </div>
                )}

                {isExpanded && (
                  <div className="mt-3 border-t border-slate-200 pt-3">
                    <p className="mb-2 text-xs font-semibold text-slate-500">
                      {t("setup.piecesUnder")}
                    </p>
                    <ul className="flex flex-col gap-1.5">
                      {pieces.map((piece) => {
                        const costing = COSTING_BADGE[piece.costing_status] ?? COSTING_BADGE.non_etudie;
                        const prod = PROD_BADGE[piece.production_status] ?? PROD_BADGE.not_sent;
                        const busy = busyPieceId === piece.id;
                        const canStudy = piece.costing_status === "non_etudie";
                        const canResume = piece.costing_status === "brouillon";
                        const canSend = piece.costing_status === "valide" && piece.production_status === "not_sent";
                        const isSent = piece.production_status !== "not_sent";

                        return (
                          <li
                            key={piece.id}
                            className="flex flex-wrap items-center gap-2 rounded bg-white px-2.5 py-2 text-xs"
                          >
                            <Package size={13} className="shrink-0 text-slate-400" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="truncate font-semibold text-slate-700">{piece.name}</span>
                                <span className="shrink-0 font-mono text-[10px] text-slate-400" dir="ltr">
                                  {piece.code ?? "—"}
                                </span>
                              </div>
                              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
                                {piece.material && <span>{piece.material}</span>}
                                {piece.estimated_time_minutes && (
                                  <span>· {formatMinutesAsHM(piece.estimated_time_minutes)}</span>
                                )}
                                {piece.phase && <span>· Phase {piece.phase}</span>}
                              </div>
                            </div>

                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${costing.cls}`}>
                              {t(costing.labelKey)}
                            </span>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${prod.cls}`}>
                              {t(prod.labelKey)}
                            </span>

                            {canStudy && (
                              <button
                                onClick={() => void handleStudyPiece(piece)}
                                disabled={busy}
                                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-amber-600 disabled:opacity-50"
                              >
                                {busy ? <Loader2 size={11} className="animate-spin" /> : <ClipboardCheck size={11} />}
                                {t("setup.studyProject")}
                              </button>
                            )}
                            {canResume && (
                              <button
                                onClick={() => void handleResumeStudy(piece)}
                                disabled={busy}
                                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-amber-500 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-amber-600 disabled:opacity-50"
                              >
                                {busy ? <Loader2 size={11} className="animate-spin" /> : <RotateCcw size={11} />}
                                {t("setup.continueStudy")}
                              </button>
                            )}
                            {canSend && (
                              <button
                                onClick={() => void handleSendPieceToProduction(piece)}
                                disabled={busy}
                                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                              >
                                {busy ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
                                {t("setup.sendToProduction")}
                              </button>
                            )}
                            {isSent && (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                                <CheckCircle2 size={10} />
                                {t("setup.pieceSentToProduction")}
                              </span>
                            )}
                          </li>
                        );
                      })}
                      {pieces.length === 0 && (
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

      {/* Modal Nouveau projet */}
      {isCreateOpen && !duplicateMatches && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleCreateAttempt}
            className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
              <h2 className="text-base font-bold text-slate-800">{t("setup.createProject")}</h2>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <AdminField label={`${t("setup.client")} *`}>
                  <select
                    value={newClientId}
                    onChange={(e) => setNewClientId(e.target.value)}
                    className={adminInputClass}
                    required
                  >
                    <option value="">— Choisir un client —</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code ? `[${c.code}] ` : ""}
                        {c.name}
                      </option>
                    ))}
                  </select>
                </AdminField>

                <AdminField label={t("setup.projectCode")}>
                  <div className="flex h-[38px] items-center rounded-lg border border-slate-200 bg-slate-50 px-3 font-mono text-sm text-slate-600" dir="ltr">
                    {isCodeLoading ? (
                      <Loader2 size={13} className="animate-spin text-slate-400" />
                    ) : (
                      codePreview ?? "—"
                    )}
                  </div>
                </AdminField>
              </div>

              <AdminField label={`${t("setup.projectName")} *`}>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  className={adminInputClass}
                  required
                  autoFocus
                />
              </AdminField>

              <AdminField label="Date de livraison">
                <input
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  className={adminInputClass}
                />
              </AdminField>

              <div>
                <div className="mb-2 flex items-center gap-2">
                  <Tag size={13} className="text-slate-500" />
                  <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                    Pièces du projet *
                  </span>
                </div>
                <PiecesInput value={newPieces} onChange={setNewPieces} compact />
                <p className="mt-1 text-[11px] text-slate-400">
                  Au moins une pièce est requise pour créer le projet.
                </p>
              </div>

              <AdminField label="Notes">
                <textarea
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  rows={2}
                  className={adminInputClass}
                />
              </AdminField>

              {createError && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                  {createError}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 px-5 py-3">
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
              >
                {t("common.cancel")}
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {isSaving && <Loader2 size={13} className="animate-spin" />}
                {isSaving ? t("setup.saving") : t("setup.createProject")}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Doublon */}
      {duplicateMatches && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                <AlertTriangle size={20} />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-800">
                  {t("setup.duplicateWarningTitle")}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {t("setup.duplicateWarningBody", { count: duplicateMatches.length })}
                </p>
              </div>
            </div>
            <ul className="mb-4 max-h-40 space-y-1 overflow-y-auto rounded-lg bg-slate-50 p-3">
              {duplicateMatches.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-semibold text-slate-700">{p.name}</span>
                  <span className="shrink-0 font-mono text-slate-400" dir="ltr">{p.code}</span>
                </li>
              ))}
            </ul>
            <div className="flex gap-2">
              <button
                onClick={() => setDuplicateMatches(null)}
                className="flex-1 rounded-lg border border-slate-300 bg-white py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => void performCreate()}
                disabled={isSaving}
                className="flex-1 rounded-lg bg-amber-600 py-2.5 text-sm font-bold text-white hover:bg-amber-700 disabled:opacity-50"
              >
                {isSaving ? t("setup.saving") : t("setup.duplicateConfirm")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal ajouter pièces à projet existant */}
      {showPieceForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={handleAddPiecesToExisting}
            className="w-full max-w-lg rounded-2xl bg-white p-5 shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800">{t("setup.addPiece")}</h2>
              <button
                type="button"
                onClick={() => setShowPieceForm(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>

            <AdminField label={`${t("setup.selectProject")} *`}>
              <select
                value={pieceProjectId}
                onChange={(e) => {
                  setPieceProjectId(e.target.value);
                  if (e.target.value && !piecesByProject[e.target.value]) {
                    void loadPieces(e.target.value);
                  }
                }}
                className={adminInputClass}
                required
              >
                <option value="">{t("setup.selectProject")}</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.code ?? "—"}
                  </option>
                ))}
              </select>
            </AdminField>

            <div className="mt-3">
              <PiecesInput
                value={pieceDrafts}
                onChange={setPieceDrafts}
                existingNames={existingPieceNamesForModal}
              />
            </div>

            <button
              type="submit"
              disabled={isImportingPieces || !pieceProjectId || pieceDrafts.length === 0}
              className="mt-4 flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {isImportingPieces && <Loader2 size={13} className="animate-spin" />}
              {isImportingPieces ? t("setup.saving") : `Ajouter ${pieceDrafts.length} pièce(s)`}
            </button>
          </form>
        </div>
      )}

      {reportProjectId && (
        <ProjectReportModal
          projectId={reportProjectId}
          onClose={() => setReportProjectId(null)}
        />
      )}
    </div>
  );
}