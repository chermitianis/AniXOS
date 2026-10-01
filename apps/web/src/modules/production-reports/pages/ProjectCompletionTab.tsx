import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, FolderKanban } from "lucide-react";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { listCompletedProjects, type ProjectCompletionHeader } from "../api/productionReportsApi";

export function ProjectCompletionTab() {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();
  const companyId = staffUser?.company_id ?? null;

  const [projects, setProjects] = useState<ProjectCompletionHeader[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    setIsLoading(true);
    void listCompletedProjects(companyId)
      .then(setProjects)
      .catch((err) => setError(err instanceof Error ? err.message : "Erreur"))
      .finally(() => setIsLoading(false));
  }, [companyId]);

  function fmtSec(s: number): string {
    if (s <= 0) return "—";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h === 0) return `${m}min`;
    if (m === 0) return `${h}h`;
    return `${h}h ${String(m).padStart(2, "0")}`;
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
      <div className="text-xs text-slate-500">
        {t("productionReports.projects.count", { count: projects.length })}
      </div>
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
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
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {projects.map((p) => (
              <tr key={p.project_id} className="hover:bg-slate-50">
                <td className="px-3 py-2">
                  <div className="font-semibold text-slate-700">{p.project_name}</div>
                  {p.project_code && <div className="font-mono text-[10px] text-slate-400" dir="ltr">{p.project_code}</div>}
                </td>
                <td className="px-3 py-2 text-slate-600">{p.client_name ?? "—"}</td>
                <td className="px-3 py-2 text-end text-slate-600">{p.pieces_count}</td>
                <td className="px-3 py-2 text-end font-mono text-slate-600" dir="ltr">{fmtSec(p.estimated_seconds)}</td>
                <td className="px-3 py-2 text-end font-mono text-slate-600" dir="ltr">{fmtSec(p.actual_seconds)}</td>
                <td className="px-3 py-2 text-end font-mono text-slate-700" dir="ltr">{p.labor_cost.toFixed(2)} TND</td>
                <td className={`px-3 py-2 text-end font-mono font-bold ${p.margin >= 0 ? "text-green-600" : "text-red-600"}`} dir="ltr">{p.margin.toFixed(2)} TND</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}