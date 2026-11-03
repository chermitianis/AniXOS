import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, FolderKanban, Download, Printer, ChevronDown, ChevronRight } from "lucide-react";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { listCompletedProjects, type ProjectCompletionHeader, listCompletedPieces, type PieceReportHeader } from "../api/productionReportsApi";
import { ProjectReportModal } from "../components/ProjectReportModal";

function parseProjectName(projectName: string | undefined | null) {
  if (!projectName) return { projectName: "—", clientName: "" };
  const match = projectName.match(/^([A-Z0-9]+)\s*-\s*(.+?)\s*-\s*(.+)$/);
  if (match) {
    return { projectName: match[3].trim(), clientName: match[2].trim() };
  }
  return { projectName, clientName: "" };
}

export function ProjectCompletionTab() {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();
  const companyId = staffUser?.company_id ?? null;

  const [projects, setProjects] = useState<ProjectCompletionHeader[]>([]);
  const [piecesByProject, setPiecesByProject] = useState<Record<string, PieceReportHeader[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [printProject, setPrintProject] = useState<ProjectCompletionHeader | null>(null);

  useEffect(() => {
    if (!companyId) return;
    setIsLoading(true);
    void listCompletedProjects(companyId)
      .then(setProjects)
      .catch((err) => setError(err instanceof Error ? err.message : "Erreur"))
      .finally(() => setIsLoading(false));
  }, [companyId]);

  async function toggleExpand(projectId: string) {
    if (expandedId === projectId) {
      setExpandedId(null);
      return;
    }
    setExpandedId(projectId);
    if (!companyId || piecesByProject[projectId]) return;

    // جلب القطع التابعة لهذا المشروع
    const allPieces = await listCompletedPieces(companyId);
    const projectPieces = allPieces.filter((p) => p.project_id === projectId);
    setPiecesByProject((prev) => ({ ...prev, [projectId]: projectPieces }));
  }

  function fmtSec(s: number): string {
    if (s <= 0) return "—";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h === 0) return `${m}min`;
    if (m === 0) return `${h}h`;
    return `${h}h ${String(m).padStart(2, "0")}`;
  }

  function exportToCsv() {
    const header = "Projet;Client;Pièces;Temps estimé;Temps réel;Coût main d'œuvre;Coût machine;Coût total;Prix de vente;Marge\n";
    const rows = projects.map((p) => {
      const { projectName } = parseProjectName(p.project_name);
      return [
        projectName,
        p.client_name ?? "—",
        p.pieces_count,
        fmtSec(p.estimated_seconds),
        fmtSec(p.actual_seconds),
        p.labor_cost.toFixed(2),
        p.machine_cost.toFixed(2),
        p.total_cost.toFixed(2),
        p.quoted_price.toFixed(2),
        p.margin.toFixed(2),
      ].join(";");
    }).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rapport_projets_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Loader2 className="me-2 animate-spin" size={18} />
        {t("common.loading")}
      </div>
    );
  }
  if (error) return <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>;
  if (projects.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-400">
        <FolderKanban size={32} className="mx-auto mb-2 text-slate-300" />
        {t("productionReports.projects.empty")}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>
          {t("productionReports.projects.count", { count: projects.length })}
        </span>
        <div className="flex items-center gap-2">
          <button onClick={exportToCsv} className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[10px] font-bold text-white">
            <Download size={10} /> CSV
          </button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-1 rounded bg-slate-800 px-2 py-1 text-[10px] font-bold text-white">
            <Printer size={10} /> PDF (Liste)
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white print:border-none">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2 text-start">{t("productionReports.projects.colProject")}</th>
              <th className="px-3 py-2 text-start">{t("productionReports.projects.colClient")}</th>
              <th className="px-3 py-2 text-end">{t("productionReports.projects.colPieces")}</th>
              <th className="px-3 py-2 text-end">{t("productionReports.projects.colEstimated")}</th>
              <th className="px-3 py-2 text-end">{t("productionReports.projects.colActual")}</th>
              <th className="px-3 py-2 text-end">{t("productionReports.projects.colCost")}</th>
              <th className="px-3 py-2 text-end">{t("productionReports.projects.colMargin")}</th>
              <th className="px-3 py-2 text-center print:hidden">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {projects.map((p) => {
              const { projectName, clientName } = parseProjectName(p.project_name);
              const isSelected = selectedId === p.project_id;
              const isExpanded = expandedId === p.project_id;
              const projectPieces = piecesByProject[p.project_id] ?? [];

              return (
                <>
                  <tr
                    key={p.project_id}
                    onClick={() => setSelectedId(isSelected ? null : p.project_id)}
                    className={`cursor-pointer transition-colors hover:bg-slate-50 ${
                      isSelected ? "bg-blue-50 ring-1 ring-inset ring-blue-200" : ""
                    }`}
                  >
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void toggleExpand(p.project_id);
                          }}
                          className="shrink-0 text-slate-400 hover:text-slate-600"
                        >
                          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                        </button>
                        <div>
                          <div className="font-semibold text-slate-700">{projectName}</div>
                          {p.project_code && <div className="font-mono text-[10px] text-slate-400" dir="ltr">{p.project_code}</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-slate-600">
                      {clientName || p.client_name || "—"}
                    </td>
                    <td className="px-3 py-2 text-end text-slate-600">{p.pieces_count}</td>
                    <td className="px-3 py-2 text-end font-mono text-slate-600" dir="ltr">{fmtSec(p.estimated_seconds)}</td>
                    <td className="px-3 py-2 text-end font-mono text-slate-600" dir="ltr">{fmtSec(p.actual_seconds)}</td>
                    <td className="px-3 py-2 text-end font-mono text-slate-700" dir="ltr">{p.total_cost.toFixed(2)} TND</td>
                    <td className={`px-3 py-2 text-end font-mono font-bold ${p.margin >= 0 ? "text-green-600" : "text-red-600"}`} dir="ltr">{p.margin.toFixed(2)} TND</td>
                    <td className="px-3 py-2 text-center">
                      {isSelected && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPrintProject(p);
                          }}
                          className="inline-flex items-center justify-center rounded-lg bg-slate-800 p-1.5 text-white hover:bg-slate-700"
                          title="Imprimer le rapport"
                        >
                          <Printer size={12} />
                        </button>
                      )}
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr>
                      <td colSpan={8} className="bg-slate-50 p-4">
                        <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                          Détail des pièces
                        </h3>
                        <table className="w-full text-xs">
                          <thead className="text-left text-slate-500">
                            <tr>
                              <th className="pb-1">Pièce</th>
                              <th className="pb-1 text-end">Temps estimé</th>
                              <th className="pb-1 text-end">Temps réel</th>
                              <th className="pb-1 text-end">Coût estimé</th>
                              <th className="pb-1 text-end">Coût réel</th>
                            </tr>
                          </thead>
                          <tbody>
                            {projectPieces.length === 0 ? (
                              <tr><td colSpan={5} className="py-2 text-center text-slate-400">Aucune pièce trouvée</td></tr>
                            ) : (
                              projectPieces.map((piece) => {
                                const pieceCost = piece.labor_cost + piece.machine_cost;
                                return (
                                  <tr key={piece.piece_task_id} className="border-t border-slate-200">
                                    <td className="py-1.5 font-semibold">{piece.piece_name}</td>
                                    <td className="py-1.5 text-end font-mono">{fmtSec(piece.estimated_seconds)}</td>
                                    <td className="py-1.5 text-end font-mono">{fmtSec(piece.actual_seconds)}</td>
                                    <td className="py-1.5 text-end font-mono">{piece.estimated_cost.toFixed(2)}</td>
                                    <td className="py-1.5 text-end font-mono">{pieceCost.toFixed(2)}</td>
                                  </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </td>
                    </tr>
                  )}
                </>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ✅ نموذج الطباعة */}
      {printProject && (
        <ProjectReportModal
          project={printProject}
          onClose={() => setPrintProject(null)}
        />
      )}
    </div>
  );
}
