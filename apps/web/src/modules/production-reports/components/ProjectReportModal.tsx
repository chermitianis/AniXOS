import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { PrintLayout } from "./PrintLayout";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { supabase } from "../../../lib/supabaseClient";
import { listCompletedPieces, type PieceReportHeader, type ProjectCompletionHeader } from "../api/productionReportsApi";

interface ProjectReportModalProps {
  project: ProjectCompletionHeader;
  onClose: () => void;
}

export function ProjectReportModal({ project, onClose }: ProjectReportModalProps) {
  const { staffUser } = useStaffAuth();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>("");
  const [pieces, setPieces] = useState<PieceReportHeader[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      if (!staffUser?.company_id) return;
      const companyId = staffUser.company_id;

      // جلب شعار الشركة واسمها
      const { data: company } = await supabase
        .from("companies")
        .select("name, logo_url")
        .eq("id", companyId)
        .maybeSingle();
      setLogoUrl((company as any)?.logo_url ?? null);
      setCompanyName((company as any)?.name ?? "");

      // جلب جميع القطع التابعة للمشروع
      const allPieces = await listCompletedPieces(companyId);
      const projectPieces = allPieces.filter((p) => p.project_id === project.project_id);
      setPieces(projectPieces);
      setIsLoading(false);
    }
    void loadData();
  }, [staffUser?.company_id, project.project_id]);

  function fmtSec(s: number): string {
    if (s <= 0) return "—";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h === 0) return `${m}min`;
    if (m === 0) return `${h}h`;
    return `${h}h ${String(m).padStart(2, "0")}`;
  }

  return (
    <PrintLayout
      title={`Rapport de Projet : ${project.project_name}`}
      subtitle={`Client : ${project.client_name ?? "—"}`}
      logoUrl={logoUrl}
      companyName={companyName}
      onClose={onClose}
    >
      {isLoading ? (
        <div className="flex items-center justify-center py-20 text-slate-400">
          <Loader2 className="me-2 animate-spin" size={18} /> Chargement...
        </div>
      ) : (
        <div className="space-y-6">
          {/* معلومات المشروع (مع كود المشروع) */}
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Informations</h2>
            <div className="grid grid-cols-2 gap-4 rounded-lg border border-slate-200 p-4 text-sm sm:grid-cols-4">
              <div><div className="text-[10px] font-bold uppercase text-slate-400">Code Projet</div><div className="font-semibold">{project.project_code ?? "—"}</div></div>
              <div><div className="text-[10px] font-bold uppercase text-slate-400">Statut</div><div className="font-semibold">{project.status}</div></div>
              <div><div className="text-[10px] font-bold uppercase text-slate-400">Date de fin</div><div className="font-semibold">{project.completed_at ? new Date(project.completed_at).toLocaleDateString("fr-FR") : "—"}</div></div>
              <div><div className="text-[10px] font-bold uppercase text-slate-400">Nombre de pièces</div><div className="font-semibold">{project.pieces_count}</div></div>
              <div><div className="text-[10px] font-bold uppercase text-slate-400">Prix de vente</div><div className="font-semibold">{project.quoted_price.toFixed(2)} TND</div></div>
            </div>
          </section>

          {/* ملخص التكاليف */}
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Résumé Financier</h2>
            <div className="grid grid-cols-2 gap-4 rounded-lg border border-slate-200 p-4 text-sm sm:grid-cols-4">
              <div><div className="text-[10px] font-bold uppercase text-slate-400">Temps estimé</div><div className="font-semibold">{fmtSec(project.estimated_seconds)}</div></div>
              <div><div className="text-[10px] font-bold uppercase text-slate-400">Temps réel</div><div className="font-semibold">{fmtSec(project.actual_seconds)}</div></div>
              <div><div className="text-[10px] font-bold uppercase text-slate-400">Coût total</div><div className="font-semibold">{project.total_cost.toFixed(2)} TND</div></div>
              <div><div className="text-[10px] font-bold uppercase text-slate-400">Marge</div><div className={`font-semibold ${project.margin >= 0 ? "text-green-600" : "text-red-600"}`}>{project.margin.toFixed(2)} TND</div></div>
            </div>
          </section>

          {/* جدول القطع */}
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Détail des Pièces</h2>
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Pièce</th>
                  <th className="px-3 py-2">Code</th>
                  <th className="px-3 py-2 text-end">Temps estimé</th>
                  <th className="px-3 py-2 text-end">Temps réel</th>
                  <th className="px-3 py-2 text-end">Coût estimé</th>
                  <th className="px-3 py-2 text-end">Coût réel</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pieces.map((p) => {
                  const totalCost = p.labor_cost + p.machine_cost;
                  return (
                    <tr key={p.piece_task_id}>
                      <td className="px-3 py-2 font-semibold">{p.piece_name}</td>
                      <td className="px-3 py-2">{p.piece_code ?? "—"}</td>
                      <td className="px-3 py-2 text-end font-mono">{fmtSec(p.estimated_seconds)}</td>
                      <td className="px-3 py-2 text-end font-mono">{fmtSec(p.actual_seconds)}</td>
                      <td className="px-3 py-2 text-end font-mono">{p.estimated_cost.toFixed(2)}</td>
                      <td className="px-3 py-2 text-end font-mono">{totalCost.toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        </div>
      )}
    </PrintLayout>
  );
}
