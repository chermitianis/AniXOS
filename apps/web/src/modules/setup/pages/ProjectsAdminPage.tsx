import { useEffect, useRef, useState, useMemo, type FormEvent, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  FolderOpen, Loader2, X, Plus, ClipboardCheck, CheckCircle2,
  AlertTriangle, Send, Search, Package,
} from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { useNav } from "../../../app/NavContext";
import { AdminField, adminInputClass } from "../components/AdminField";
import { ProjectReportModal } from "../components/ProjectReportModal";
import { COMMON_MATERIALS } from "../../../shared/constants/materials";
import type { Project, PieceTask, Client } from "../../../shared/types/database";

type ClientWithCode = Client & { code: string | null };
type StatusTab = "all" | "draft" | "studying" | "approved" | "in_production" | "completed";

type PieceWithProduction = PieceTask & {
  production_status?: "not_sent" | "sent";
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
  draft:                  "bg-slate-100 text-slate-600",
  studying:               "bg-amber-100 text-amber-700",
  studied:                "bg-amber-100 text-amber-700",
  approved:               "bg-blue-100 text-blue-700",
  ready_for_production:   "bg-indigo-100 text-indigo-700",
  in_production:          "bg-indigo-100 text-indigo-700",
  on_hold:                "bg-orange-100 text-orange-700",
  completed:              "bg-green-100 text-green-700",
  cancelled:              "bg-red-100 text-red-600",
};

const STATUS_LABEL_KEYS: Record<string, string> = {
  draft:                  "setup.statusDraft",
  studying:               "setup.statusStudying",
  studied:                "setup.statusStudied",
  approved:               "setup.statusApproved",
  ready_for_production:   "setup.statusReadyForProduction",
  in_production:          "setup.statusInProduction",
  on_hold:                "setup.statusOnHold",
  completed:              "setup.statusCompleted",
  cancelled:              "setup.statusCancelled",
};

function matchesTab(status: string, tab: StatusTab): boolean {
  if (tab === "all") return true;
  if (tab === "in_production")
    return status === "in_production" || status === "ready_for_production";
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
  const nav = useNav();

  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<ClientWithCode[]>([]);
  const [piecesByProject, setPiecesByProject] = useState<Record<string, PieceWithProduction[]>>({});
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [reportProjectId, setReportProjectId] = useState<string | null>(null);

  const [statusTab, setStatusTab] = useState<StatusTab>("all");
  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [duplicateMatches, setDuplicateMatches] = useState<Project[] | null>(null);
  const [sendingPieceId, setSendingPieceId] = useState<string | null>(null);

  const [pieceName, setPieceName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImportNames, setPendingImportNames] = useState<string[]>([]);
  const [isImportingPieces, setIsImportingPieces] = useState(false);
  const [pieceProjectId, setPieceProjectId] = useState("");
  const [piecePhase, setPiecePhase] = useState("");
  const [pieceEstimateHours, setPieceEstimateHours] = useState("");
  const [pieceEstimateMinutesPart, setPieceEstimateMinutesPart] = useState("");
  const [pieceMaterial, setPieceMaterial] = useState("");
  const [pieceQuantity, setPieceQuantity] = useState("1");
  const [showPieceForm, setShowPieceForm] = useState(false);

  async function loadProjects() {
    const { data } = await supabase
      .from("projects")
      .select("*")
      .eq("is_archived", false)
      .order("created_at", { ascending: false });
    setProjects((data as Project[]) ?? []);
  }

  async function loadClients() {
    const { data } = await supabase.from("clients").select("*").order("name");
    setClients((data as ClientWithCode[]) ?? []);
  }

  async function loadPieces(projectId: string) {
    const { data } = await supabase
      .from("pieces_tasks")
      .select("*")
      .eq("project_id", projectId)
      .order("sequence_order");
    setPiecesByProject((prev) => ({
      ...prev,
      [projectId]: (data as PieceWithProduction[]) ?? [],
    }));
  }

  useEffect(() => {
    void loadProjects();
    void loadClients();
  }, []);

  function detectDuplicates(nameToCheck: string): Project[] {
    const normalized = nameToCheck.trim().toLowerCase();
    if (!normalized) return [];
    return projects.filter((p) => p.name.trim().toLowerCase() === normalized);
  }

  function handleCreateAttempt(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const matches = detectDuplicates(name);
    if (matches.length > 0) {
      setDuplicateMatches(matches);
      return;
    }
    void performCreate();
  }

  async function performCreate() {
    if (!staffUser) return;
    setIsSaving(true);
    setError(null);
    try {
      const { error: insertError } = await supabase.from("projects").insert({
        company_id: staffUser.company_id,
        client_id: clientId || null,
        name: name.trim(),
        code: null,
        status: "draft",
      });
      if (insertError) {
        setError(insertError.message);
        return;
      }
      setName("");
      setClientId("");
      setDuplicateMatches(null);
      setIsCreateOpen(false);
      await loadProjects();
    } finally {
      setIsSaving(false);
    }
  }

  function goToStudy(projectId: string) {
    nav.goToSection("ingenierie_nomenclature", { projectId });
  }

  async function handleApproveStudy(projectId: string) {
    await supabase
      .from("projects")
      .update({
        status: "approved",
        study_completed_at: new Date().toISOString(),
      })
      .eq("id", projectId);
    await loadProjects();
  }

  /**
   * Envoie UNE SEULE pièce en production.
   * Si toutes les pièces du projet sont envoyées → projet = ready_for_production.
   */
  async function handleSendPieceToProduction(projectId: string, pieceId: string) {
    setSendingPieceId(pieceId);
    try {
      await supabase
        .from("pieces_tasks")
        .update({
          production_status: "sent",
          sent_to_production_at: new Date().toISOString(),
        } as never)
        .eq("id", pieceId);

      // Rafraîchir la liste des pièces de ce projet
      await loadPieces(projectId);

      // Vérifier si toutes les pièces du projet sont envoyées
      const { data: siblings } = await supabase
        .from("pieces_tasks")
        .select("production_status")
        .eq("project_id", projectId);

      const all = (siblings ?? []) as { production_status: string }[];
      if (all.length > 0 && all.every((p) => p.production_status === "sent")) {
        await supabase
          .from("projects")
          .update({
            status: "ready_for_production",
            sent_to_production_at: new Date().toISOString(),
          } as never)
          .eq("id", projectId);
        await loadProjects();
      }
    } finally {
      setSendingPieceId(null);
    }
  }

  async function handleAddPiece(e: FormEvent) {
    e.preventDefault();
    if (!staffUser || !pieceProjectId) return;
    const currentPieces = piecesByProject[pieceProjectId] ?? [];
    const totalMinutes =
      Number(pieceEstimateHours || 0) * 60 + Number(pieceEstimateMinutesPart || 0);
    await supabase.from("pieces_tasks").insert({
      company_id: staffUser.company_id,
      project_id: pieceProjectId,
      name: pieceName.trim(),
      phase: piecePhase || null,
      estimated_time_minutes: totalMinutes > 0 ? totalMinutes : null,
      material: pieceMaterial || null,
      quantity: Number(pieceQuantity) || 1,
      sequence_order: currentPieces.length,
    });
    setPieceName("");
    setPiecePhase("");
    setPieceEstimateHours("");
    setPieceEstimateMinutesPart("");
    setPieceMaterial("");
    setPieceQuantity("1");
    await loadPieces(pieceProjectId);
  }

  function handleFilesSelected(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const names = files.map((f) => f.name.replace(/\.[^./\\]+$/, "").trim()).filter(Boolean);
    setPendingImportNames((prev) => [...prev, ...names]);
    e.target.value = "";
  }

  function removePendingImportName(index: number) {
    setPendingImportNames((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleImportPendingPieces() {
    if (!staffUser || !pieceProjectId || pendingImportNames.length === 0) return;
    setIsImportingPieces(true);
    try {
      const currentPieces = piecesByProject[pieceProjectId] ?? [];
      const totalMinutes =
        Number(pieceEstimateHours || 0) * 60 + Number(pieceEstimateMinutesPart || 0);
      const rows = pendingImportNames.map((n, i) => ({
        company_id: staffUser.company_id,
        project_id: pieceProjectId,
        name: n,
        phase: piecePhase || null,
        estimated_time_minutes: totalMinutes > 0 ? totalMinutes : null,
        material: pieceMaterial || null,
        quantity: Number(pieceQuantity) || 1,
        sequence_order: currentPieces.length + i,
      }));
      await supabase.from("pieces_tasks").insert(rows);
      setPendingImportNames([]);
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
    await supabase
      .from("projects")
      .update({ is_archived: true, archived_at: new Date().toISOString() })
      .eq("id", projectId);
    await loadProjects();
  }

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
          onClick={() => setShowPieceForm(true)}
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
            const canSendPieces = p.status === "approved" || p.status === "ready_for_production";
            const sentCount = pieces.filter((x) => x.production_status === "sent").length;
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
                      {canSendPieces && pieces.length > 0 && (
                        <span className="text-indigo-600">
                          · {sentCount}/{pieces.length} envoyée(s)
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="shrink-0 text-slate-400">{isExpanded ? "▲" : "▼"}</span>
                </button>

                {/* Actions au niveau projet (workflow étude) */}
                <div className="mt-2 flex flex-wrap gap-2">
                  {(p.status === "draft" || p.status === "studying") && (
                    <button
                      onClick={() => goToStudy(p.id)}
                      className="inline-flex items-center gap-1 rounded bg-amber-500 px-3 py-1 text-xs font-bold text-white hover:bg-amber-600"
                    >
                      <ClipboardCheck size={12} />
                      {p.status === "draft" ? t("setup.studyProject") : t("setup.continueStudy")}
                    </button>
                  )}

                  {p.status === "studying" && (
                    <button
                      onClick={() => void handleApproveStudy(p.id)}
                      className="inline-flex items-center gap-1 rounded bg-green-600 px-3 py-1 text-xs font-bold text-white hover:bg-green-700"
                    >
                      <CheckCircle2 size={12} />
                      {t("setup.approveStudy")}
                    </button>
                  )}

                  <button
                    onClick={() => setReportProjectId(p.id)}
                    className="rounded bg-slate-800 px-3 py-1 text-xs font-semibold text-white"
                  >
                    {t("setup.viewReport")}
                  </button>

                  {p.status === "completed" && (
                    <button
                      onClick={() => void archiveProject(p.id)}
                      className="rounded bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700"
                    >
                      {t("setup.archiveAction")}
                    </button>
                  )}
                </div>

                {/* Détail : pièces du projet + envoi pièce par pièce */}
                {isExpanded && (
                  <div className="mt-3 border-t border-slate-200 pt-3">
                    <p className="mb-2 text-xs font-semibold text-slate-500">
                      {t("setup.piecesUnder")}
                    </p>
                    <ul className="flex flex-col gap-1.5">
                      {pieces.map((piece) => {
                        const isSent = piece.production_status === "sent";
                        const isSending = sendingPieceId === piece.id;
                        const showSendButton = canSendPieces && !isSent;
                        return (
                          <li
                            key={piece.id}
                            className="flex items-center gap-2 rounded bg-white px-2.5 py-2 text-xs"
                          >
                            <Package size={13} className="shrink-0 text-slate-400" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2">
                                <span className="truncate font-semibold text-slate-700">
                                  {piece.name}
                                </span>
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

                            {isSent ? (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                                <CheckCircle2 size={10} />
                                {t("setup.pieceSentToProduction")}
                              </span>
                            ) : showSendButton ? (
                              <button
                                type="button"
                                disabled={isSending}
                                onClick={() => void handleSendPieceToProduction(p.id, piece.id)}
                                className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-[10px] font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                              >
                                {isSending ? (
                                  <Loader2 size={11} className="animate-spin" />
                                ) : (
                                  <Send size={11} />
                                )}
                                {t("setup.sendToProduction")}
                              </button>
                            ) : null}
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
            className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800">{t("setup.createProject")}</h2>
              <button
                type="button"
                onClick={() => setIsCreateOpen(false)}
                className="rounded p-1 text-slate-400 hover:bg-slate-100"
              >
                <X size={18} />
              </button>
            </div>
            <AdminField label={t("setup.projectName")}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={adminInputClass}
                required
                autoFocus
              />
            </AdminField>
            <AdminField label={t("setup.client")}>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className={adminInputClass}
              >
                <option value="">{t("setup.noClient")}</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code ? `${c.code} — ` : ""}
                    {c.name}
                  </option>
                ))}
              </select>
            </AdminField>
            <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-[11px] text-slate-500">
              {t("setup.codeAutoNotice")}
            </p>
            {error && (
              <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                {error}
              </div>
            )}
            <button
              type="submit"
              disabled={isSaving}
              className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {isSaving ? t("setup.saving") : t("setup.createProject")}
            </button>
          </form>
        </div>
      )}

      {/* Modal Doublon */}
      {duplicateMatches && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
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

      {/* Modal Nouvelle pièce */}
      {showPieceForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form
            onSubmit={async (e) => {
              await handleAddPiece(e);
              setShowPieceForm(false);
            }}
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
            <AdminField label={t("setup.projectName")}>
              <select
                value={pieceProjectId}
                onChange={(e) => setPieceProjectId(e.target.value)}
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
            <AdminField label={t("setup.pieceName")}>
              <div className="flex gap-2">
                <input
                  value={pieceName}
                  onChange={(e) => setPieceName(e.target.value)}
                  className={adminInputClass}
                  required={pendingImportNames.length === 0}
                />
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={handleFilesSelected}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!pieceProjectId}
                  title={t("setup.browseHint")}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                >
                  <FolderOpen size={14} />
                  {t("setup.browseFiles")}
                </button>
              </div>
            </AdminField>
            {pendingImportNames.length > 0 && (
              <div className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50 p-3">
                <p className="mb-2 text-xs font-bold text-indigo-700">
                  {t("setup.piecesToImport", { count: pendingImportNames.length })}
                </p>
                <ul className="mb-2 max-h-32 space-y-1 overflow-y-auto">
                  {pendingImportNames.map((n, i) => (
                    <li
                      key={`${n}-${i}`}
                      className="flex items-center justify-between gap-2 rounded bg-white px-2 py-1 text-xs text-slate-600"
                    >
                      <span className="truncate">{n}</span>
                      <button
                        type="button"
                        onClick={() => removePendingImportName(i)}
                        className="shrink-0 text-slate-400 hover:text-red-500"
                      >
                        <X size={12} />
                      </button>
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={() => void handleImportPendingPieces()}
                  disabled={isImportingPieces}
                  className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-indigo-600 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {isImportingPieces && <Loader2 size={12} className="animate-spin" />}
                  {t("setup.importPiecesButton", { count: pendingImportNames.length })}
                </button>
              </div>
            )}
            <AdminField label={t("setup.piecePhase")}>
              <input
                type="number"
                min="1"
                step="1"
                value={piecePhase}
                onChange={(e) => setPiecePhase(e.target.value)}
                className={adminInputClass}
                placeholder="1"
              />
            </AdminField>
            <AdminField label={t("setup.pieceCncEstimate")}>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  value={pieceEstimateHours}
                  onChange={(e) => setPieceEstimateHours(e.target.value)}
                  className={`${adminInputClass} text-center`}
                  placeholder="0"
                />
                <span className="text-xs font-semibold text-slate-400">{t("setup.hoursShort")}</span>
                <input
                  type="number"
                  min="0"
                  max="59"
                  value={pieceEstimateMinutesPart}
                  onChange={(e) => setPieceEstimateMinutesPart(e.target.value)}
                  className={`${adminInputClass} text-center`}
                  placeholder="0"
                />
                <span className="text-xs font-semibold text-slate-400">{t("kiosk.minutesShort")}</span>
              </div>
            </AdminField>
            <AdminField label={t("setup.pieceMaterial")}>
              <input
                list="materials-list"
                value={pieceMaterial}
                onChange={(e) => setPieceMaterial(e.target.value)}
                className={adminInputClass}
                placeholder={t("setup.pieceMaterialPlaceholder")}
              />
            </AdminField>
            <AdminField label={t("setup.pieceQuantity")}>
              <input
                type="number"
                min="1"
                value={pieceQuantity}
                onChange={(e) => setPieceQuantity(e.target.value)}
                className={adminInputClass}
              />
            </AdminField>
            <datalist id="materials-list">
              {COMMON_MATERIALS.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
            <button
              type="submit"
              className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-bold text-white"
            >
              {t("common.add")}
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