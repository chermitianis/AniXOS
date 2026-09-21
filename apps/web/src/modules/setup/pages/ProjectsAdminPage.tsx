import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { AdminField, adminInputClass } from "../components/AdminField";
import { ProjectReportModal } from "../components/ProjectReportModal";
import { COMMON_MATERIALS } from "../../../shared/constants/materials";
import type { Project, PieceTask, Client } from "../../../shared/types/database";

/** العميل مع عمود code (مضاف عبر migration 0052، غير موجود بعد في النوع المولّد) */
type ClientWithCode = Client & { code: string | null };

/** توليد كود المشروع: كود العميل (رقمان) + تاريخ اليوم DDMMYYYY، مع لاحقة
 * حرف تصاعدي (B، C...) عند وجود تعارض — يضمن كوداً فريداً دائماً لكل مشروع
 * مع الحفاظ على شكل نظيف وقابل للقراءة في الحالة الشائعة (مشروع واحد لليوم) */
async function generateProjectCode(clientCode: string): Promise<string> {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const base = `${clientCode}${dd}${mm}${now.getFullYear()}`;

  const { data } = await supabase.from("projects").select("code").ilike("code", `${base}%`);
  const existing = new Set(((data ?? []) as { code: string }[]).map((r) => r.code));
  if (!existing.has(base)) return base;
  for (const letter of "BCDEFGHIJKLMNOPQRSTUVWXYZ") {
    if (!existing.has(base + letter)) return base + letter;
  }
  return `${base}${Date.now()}`;
}

/** يحوّل عدد الدقائق إلى صيغة مقروءة "1h 30min" أو "45min" فقط */
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
  const [projects, setProjects] = useState<Project[]>([]);
  const [clients, setClients] = useState<ClientWithCode[]>([]);
  const [piecesByProject, setPiecesByProject] = useState<Record<string, PieceTask[]>>({});
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null);
  const [reportProjectId, setReportProjectId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"projects" | "pieces">("pieces");

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [clientId, setClientId] = useState("");
  const [isGeneratingCode, setIsGeneratingCode] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [pieceName, setPieceName] = useState("");
  const [pieceProjectId, setPieceProjectId] = useState("");
  const [piecePhase, setPiecePhase] = useState("");
  const [pieceEstimateHours, setPieceEstimateHours] = useState("");
  const [pieceEstimateMinutesPart, setPieceEstimateMinutesPart] = useState("");
  const [pieceMaterial, setPieceMaterial] = useState("");
  const [pieceQuantity, setPieceQuantity] = useState("1");

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
    setPiecesByProject((prev) => ({ ...prev, [projectId]: (data as PieceTask[]) ?? [] }));
  }

  useEffect(() => {
    void loadProjects();
    void loadClients();
  }, []);

  async function handleCreateProject(e: FormEvent) {
    e.preventDefault();
    if (!staffUser) return;
    setError(null);
    setIsSaving(true);

    try {
      const { error: insertError } = await supabase.from("projects").insert({
        company_id: staffUser.company_id,
        client_id: clientId || null,
        name,
        code,
        status: "planned",
      });

      if (insertError) {
        setError(insertError.message.includes("duplicate") ? t("setup.codeTaken") : t("setup.genericError"));
        return;
      }

      setName("");
      setCode("");
      setClientId("");
      await loadProjects();
    } finally {
      setIsSaving(false);
    }
  }

  async function handleAddPiece(e: FormEvent) {
    e.preventDefault();
    if (!staffUser || !pieceProjectId) return;

    const currentPieces = piecesByProject[pieceProjectId] ?? [];
    const totalMinutes = Number(pieceEstimateHours || 0) * 60 + Number(pieceEstimateMinutesPart || 0);

    await supabase.from("pieces_tasks").insert({
      company_id: staffUser.company_id,
      project_id: pieceProjectId,
      name: pieceName,
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

  /** توليد كود المشروع تلقائياً بمجرد اختيار العميل */
  async function handleClientChange(newClientId: string) {
    setClientId(newClientId);
    const client = clients.find((c) => c.id === newClientId);
    if (!client?.code) {
      setCode("");
      return;
    }
    setIsGeneratingCode(true);
    const generated = await generateProjectCode(client.code);
    setCode(generated);
    setIsGeneratingCode(false);
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
    await supabase.from("projects").update({ is_archived: true, archived_at: new Date().toISOString() }).eq("id", projectId);
    await loadProjects();
  }

  return (
    <div>
      <div className="mb-5 flex gap-2 border-b border-slate-200">
        <button type="button" onClick={() => setActiveTab("pieces")} className={`px-4 py-2 text-sm font-semibold ${activeTab === "pieces" ? "border-b-2 border-blue-600 text-blue-600" : "text-slate-400"}`}>{t("setup.pieces")}</button>
        <button type="button" onClick={() => setActiveTab("projects")} className={`px-4 py-2 text-sm font-semibold ${activeTab === "projects" ? "border-b-2 border-blue-600 text-blue-600" : "text-slate-400"}`}>{t("setup.projects")}</button>
      </div>

      {activeTab === "projects" ? <div className="grid gap-6 md:grid-cols-2">
      <form onSubmit={handleCreateProject} className="h-fit rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-bold text-slate-800">{t("setup.createProject")}</h2>

        <AdminField label={t("setup.projectName")}>
          <input value={name} onChange={(e) => setName(e.target.value)} className={adminInputClass} required />
        </AdminField>

        <AdminField label={t("setup.client")}>
          <select value={clientId} onChange={(e) => void handleClientChange(e.target.value)} className={adminInputClass}>
            <option value="">{t("setup.noClient")}</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.code ? `${c.code} — ` : ""}
                {c.name}
              </option>
            ))}
          </select>
        </AdminField>

        <AdminField label={t("setup.projectCode")}>
          <input
            value={isGeneratingCode ? t("setup.generatingCode") : code}
            onChange={(e) => setCode(e.target.value)}
            className={adminInputClass}
            dir="ltr"
            required
          />
        </AdminField>

        {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

        <button
          type="submit"
          disabled={isSaving}
          className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-bold text-white disabled:opacity-50"
        >
          {isSaving ? t("setup.saving") : t("setup.createProject")}
        </button>
      </form>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-bold text-slate-800">{t("setup.projects")} ({projects.length})</h2>
        <ul className="flex flex-col gap-3">
          {projects.map((p) => (
            <li key={p.id} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
              <button onClick={() => toggleExpand(p.id)} className="flex w-full items-center justify-between text-sm">
                <div className="text-right">
                  <span className="font-semibold text-slate-700">{p.name}</span>
                  <span className="mr-2 text-slate-400">{p.code}</span>
                  <span
                    className={`mr-2 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      p.status === "completed" ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-500"
                    }`}
                  >
                    {p.status === "completed" ? t("setup.statusCompleted") : p.status === "in_progress" ? t("setup.statusInProgress") : p.status}
                  </span>
                </div>
                <span className="text-slate-400">{expandedProjectId === p.id ? "▲" : "▼"}</span>
              </button>

              <div className="mt-2 flex gap-2">
                <button
                  onClick={() => setReportProjectId(p.id)}
                  className="rounded bg-slate-800 px-3 py-1 text-xs font-semibold text-white"
                >
                  {t("setup.viewReport")}
                </button>
                {p.status === "completed" && (
                  <button
                    onClick={() => archiveProject(p.id)}
                    className="rounded bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-700"
                  >
                    {t("setup.archiveAction")}
                  </button>
                )}
              </div>

              {expandedProjectId === p.id && (
                <div className="mt-3 border-t border-slate-200 pt-3">
                  <p className="mb-2 text-xs font-semibold text-slate-500">{t("setup.piecesUnder")}</p>
                  <ul className="mb-3 flex flex-col gap-1">
                    {(piecesByProject[p.id] ?? []).map((piece) => (
                      <li key={piece.id} className="rounded bg-white px-2 py-1 text-xs text-slate-600">
                        {piece.name} {piece.phase && `— ${piece.phase}`}{" "}
                        {piece.estimated_time_minutes && `(${formatMinutesAsHM(piece.estimated_time_minutes)})`}
                      </li>
                    ))}
                    {(piecesByProject[p.id] ?? []).length === 0 && (
                      <li className="text-xs text-slate-400">{t("setup.noPiecesYet")}</li>
                    )}
                  </ul>

                  <div className="flex flex-wrap gap-2">
                    <input
                      value={pieceName}
                      onChange={(e) => setPieceName(e.target.value)}
                      placeholder={t("setup.pieceName")}
                      className="min-w-[120px] flex-1 rounded border border-slate-300 px-2 py-1 text-xs"
                      required
                    />
                    <input
                      value={piecePhase}
                      onChange={(e) => setPiecePhase(e.target.value)}
                      placeholder={t("setup.piecePhase")}
                      className="w-24 rounded border border-slate-300 px-2 py-1 text-xs"
                    />
                    <div className="flex items-center gap-1 rounded border border-slate-300 px-2 py-1" title={t("setup.pieceCncEstimate")}>
                      <input
                        type="number"
                        min="0"
                        value={pieceEstimateHours}
                        onChange={(e) => setPieceEstimateHours(e.target.value)}
                        placeholder="h"
                        className="w-8 text-xs outline-none"
                      />
                      <span className="text-xs text-slate-300">:</span>
                      <input
                        type="number"
                        min="0"
                        max="59"
                        value={pieceEstimateMinutesPart}
                        onChange={(e) => setPieceEstimateMinutesPart(e.target.value)}
                        placeholder="min"
                        className="w-9 text-xs outline-none"
                      />
                    </div>
                    <input
                      list="materials-list"
                      value={pieceMaterial}
                      onChange={(e) => setPieceMaterial(e.target.value)}
                      placeholder={t("setup.pieceMaterial")}
                      className="w-32 rounded border border-slate-300 px-2 py-1 text-xs"
                    />
                    <input
                      type="number"
                      min="1"
                      value={pieceQuantity}
                      onChange={(e) => setPieceQuantity(e.target.value)}
                      placeholder={t("setup.pieceQuantity")}
                      className="w-16 rounded border border-slate-300 px-2 py-1 text-xs"
                    />
                    <button type="submit" className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
                      {t("common.add")}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
          {projects.length === 0 && <li className="text-sm text-slate-400">{t("setup.noDataYet")}</li>}
        </ul>
      </div>

      {reportProjectId && (
        <ProjectReportModal projectId={reportProjectId} onClose={() => setReportProjectId(null)} />
      )}
      </div> : <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]">
        <form onSubmit={handleAddPiece} className="h-fit rounded-xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 text-lg font-bold text-slate-800">{t("setup.addPiece")}</h2>
          <AdminField label={t("setup.client")}><select value={clients.find((c) => c.id === projects.find((p) => p.id === pieceProjectId)?.client_id)?.id ?? ""} onChange={(e) => { const project = projects.find((p) => p.client_id === e.target.value); if (project) setPieceProjectId(project.id); }} className={adminInputClass}><option value="">{t("setup.noClient")}</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></AdminField>
          <AdminField label={t("setup.projectName")}><select value={pieceProjectId} onChange={(e) => setPieceProjectId(e.target.value)} className={adminInputClass} required><option value="">{t("setup.selectProject")}</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.name} — {p.code}</option>)}</select></AdminField>
          <AdminField label={t("setup.pieceName")}><input value={pieceName} onChange={(e) => setPieceName(e.target.value)} className={adminInputClass} required /></AdminField>
          <AdminField label={t("setup.piecePhase")}><input type="number" min="1" step="1" value={piecePhase} onChange={(e) => setPiecePhase(e.target.value)} className={adminInputClass} placeholder="1" /></AdminField>
          <AdminField label={t("setup.pieceCncEstimate")}>
            <div className="flex items-center gap-2">
              <input type="number" min="0" value={pieceEstimateHours} onChange={(e) => setPieceEstimateHours(e.target.value)} className={`${adminInputClass} text-center`} placeholder="0" />
              <span className="text-xs font-semibold text-slate-400">{t("setup.hoursShort")}</span>
              <input type="number" min="0" max="59" value={pieceEstimateMinutesPart} onChange={(e) => setPieceEstimateMinutesPart(e.target.value)} className={`${adminInputClass} text-center`} placeholder="0" />
              <span className="text-xs font-semibold text-slate-400">{t("kiosk.minutesShort")}</span>
            </div>
          </AdminField>
          <AdminField label={t("setup.pieceMaterial")}><input list="materials-list" value={pieceMaterial} onChange={(e) => setPieceMaterial(e.target.value)} className={adminInputClass} placeholder={t("setup.pieceMaterialPlaceholder")} /></AdminField>
          <AdminField label={t("setup.pieceQuantity")}><input type="number" min="1" value={pieceQuantity} onChange={(e) => setPieceQuantity(e.target.value)} className={adminInputClass} /></AdminField>
          <datalist id="materials-list">
            {COMMON_MATERIALS.map((m) => <option key={m} value={m} />)}
          </datalist>
          <button type="submit" className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-bold text-white">{t("common.add")}</button>
        </form>
        <div className="rounded-xl border border-slate-200 bg-white p-5"><h2 className="mb-4 text-lg font-bold text-slate-800">{t("setup.pieces")}</h2><div className="space-y-2">{projects.map((p) => <div key={p.id} className="rounded-lg border border-slate-100 p-3"><button type="button" onClick={() => toggleExpand(p.id)} className="font-semibold text-slate-700">{p.name} — {p.code}</button>{expandedProjectId === p.id && <ul className="mt-2 space-y-1">{(piecesByProject[p.id] ?? []).map((piece) => <li key={piece.id} className="rounded bg-slate-50 px-3 py-2 text-sm text-slate-600">{piece.name} — {piece.phase ?? "1"} — {piece.estimated_time_minutes ? formatMinutesAsHM(piece.estimated_time_minutes) : "—"} — {piece.material ?? t("setup.noMaterial")} — ×{piece.quantity}</li>)}</ul>}</div>)}</div></div>
      </div>}
    </div>
  );
}
