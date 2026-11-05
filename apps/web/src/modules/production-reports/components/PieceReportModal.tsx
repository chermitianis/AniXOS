import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { PrintLayout } from "./PrintLayout";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { supabase } from "../../../lib/supabaseClient";
import {
  getPieceWorkPackages,
  getPieceOperations,
  getPieceSessions,
  type PieceReportHeader,
  type PieceWpRow,
  type PieceOpRow,
  type PieceSessionRow,
} from "../api/productionReportsApi";

interface PieceReportModalProps {
  piece: PieceReportHeader;
  onClose: () => void;
}

export function PieceReportModal({ piece, onClose }: PieceReportModalProps) {
  const { staffUser } = useStaffAuth();
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string>("");
  const [wps, setWps] = useState<PieceWpRow[]>([]);
  const [ops, setOps] = useState<PieceOpRow[]>([]);
  const [sessions, setSessions] = useState<PieceSessionRow[]>([]);
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

      // جلب تفاصيل القطعة
      const [w, o, s] = await Promise.all([
        getPieceWorkPackages(companyId, piece.piece_task_id),
        getPieceOperations(companyId, piece.piece_task_id),
        getPieceSessions(companyId, piece.piece_task_id),
      ]);
      setWps(w);
      setOps(o);
      setSessions(s);
      setIsLoading(false);
    }
    void loadData();
  }, [staffUser?.company_id, piece.piece_task_id]);

  function fmtSec(s: number): string {
    if (s <= 0) return "—";
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    if (h === 0) return `${m}min`;
    if (m === 0) return `${h}h`;
    return `${h}h ${String(m).padStart(2, "0")}`;
  }

  const totalCost = piece.labor_cost + piece.machine_cost;
  const margin = piece.estimated_cost - totalCost;

  return (
    <PrintLayout
      title={`Rapport de Pièce : ${piece.piece_name}`}
      subtitle={`Projet : ${piece.project_name}`} // ✅ المشروع فقط، بدون العميل
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
          {/* معلومات القطعة (مع كود المشروع) */}
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Informations</h2>
            <div className="grid grid-cols-2 gap-4 rounded-lg border border-slate-200 p-4 text-sm sm:grid-cols-4">
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-400">Code Pièce</div>
                <div className="font-semibold">{piece.piece_code ?? "—"}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-400">Code Projet</div>
                <div className="font-semibold">{piece.project_code ?? "—"}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-400">Quantité</div>
                <div className="font-semibold">{piece.quantity}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-400">Statut</div>
                <div className="font-semibold">{piece.production_status}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-400">Date de fin</div>
                <div className="font-semibold">{piece.completed_at ? new Date(piece.completed_at).toLocaleDateString("fr-FR") : "—"}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-400">Projet</div>
                <div className="font-semibold">{piece.project_name}</div>
              </div>
              <div>
                <div className="text-[10px] font-bold uppercase text-slate-400">Client</div>
                <div className="font-semibold">{piece.client_name ?? "—"}</div>
              </div>
            </div>
          </section>

          {/* ملخص التكاليف */}
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Résumé Financier</h2>
            <div className="grid grid-cols-2 gap-4 rounded-lg border border-slate-200 p-4 text-sm sm:grid-cols-4">
              <div><div className="text-[10px] font-bold uppercase text-slate-400">Coût estimé</div><div className="font-semibold">{piece.estimated_cost.toFixed(2)} TND</div></div>
              <div><div className="text-[10px] font-bold uppercase text-slate-400">Coût réel</div><div className="font-semibold">{totalCost.toFixed(2)} TND</div></div>
              <div><div className="text-[10px] font-bold uppercase text-slate-400">Marge</div><div className={`font-semibold ${margin >= 0 ? "text-green-600" : "text-red-600"}`}>{margin.toFixed(2)} TND</div></div>
              <div><div className="text-[10px] font-bold uppercase text-slate-400">Détail</div><div className="text-xs text-slate-500">MO: {piece.labor_cost.toFixed(2)} | Machine: {piece.machine_cost.toFixed(2)}</div></div>
            </div>
          </section>

          {/* الجلسات */}
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Détail des Sessions</h2>
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Employé</th>
                  <th className="px-3 py-2">Description</th>
                  <th className="px-3 py-2 text-end">Temps passé</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sessions.map((s, idx) => (
                  <tr key={s.session_id}>
                    <td className="px-3 py-2">{new Date(s.started_at).toLocaleDateString("fr-FR")}</td>
                    <td className="px-3 py-2">{s.worker_name}</td>
                    <td className="px-3 py-2">{piece.piece_name} - Session {idx + 1}{s.is_last && " (Terminé)"}</td>
                    <td className="px-3 py-2 text-end font-mono">{fmtSec(s.duration_seconds)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* الحزم */}
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Détail par Paquet</h2>
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Paquet</th>
                  <th className="px-3 py-2">Statut</th>
                  <th className="px-3 py-2 text-end">Estimé</th>
                  <th className="px-3 py-2 text-end">Réel</th>
                  <th className="px-3 py-2 text-end">Sessions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {wps.map((wp) => (
                  <tr key={wp.of_work_package_id}>
                    <td className="px-3 py-2 font-semibold">{wp.interface_type.toUpperCase()}</td>
                    <td className="px-3 py-2">{wp.status}</td>
                    <td className="px-3 py-2 text-end">{wp.estimated_hours > 0 ? `${wp.estimated_hours.toFixed(2)}h` : "—"}</td>
                    <td className="px-3 py-2 text-end">{fmtSec(wp.actual_seconds)}</td>
                    <td className="px-3 py-2 text-end">{wp.sessions_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* العمليات */}
          <section>
            <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">Opérations</h2>
            <table className="w-full text-sm">
              <thead className="bg-slate-100 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Opération</th>
                  <th className="px-3 py-2 text-end">Heures Est.</th>
                  <th className="px-3 py-2 text-end">Coût Est.</th>
                  <th className="px-3 py-2 text-end">Heures Réel.</th>
                  <th className="px-3 py-2 text-end">Coût Réel</th>
                  <th className="px-3 py-2 text-end">Écart</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ops.map((op) => {
                  const estCost = op.estimated_hours * op.hourly_rate;
                  const actualHours = op.actual_seconds / 3600;
                  const costEcart = estCost - op.actual_cost;
                  return (
                    <tr key={op.operation_id}>
                      <td className="px-3 py-2">{op.label ?? op.stage}</td>
                      <td className="px-3 py-2 text-end font-mono">{op.estimated_hours.toFixed(2)}h</td>
                      <td className="px-3 py-2 text-end font-mono">{estCost.toFixed(2)}</td>
                      <td className="px-3 py-2 text-end font-mono">{actualHours.toFixed(2)}h</td>
                      <td className="px-3 py-2 text-end font-mono">{op.actual_cost.toFixed(2)}</td>
                      <td className={`px-3 py-2 text-end font-mono font-bold ${costEcart >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {costEcart >= 0 ? "+" : "−"}{Math.abs(costEcart).toFixed(2)}
                      </td>
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
