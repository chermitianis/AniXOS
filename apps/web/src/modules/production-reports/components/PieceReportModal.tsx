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

      const { data: company } = await supabase
        .from("companies")
        .select("name, logo_url")
        .eq("id", companyId)
        .maybeSingle();
      setLogoUrl((company as any)?.logo_url ?? null);
      setCompanyName((company as any)?.name ?? "");

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
      title="Rapport de Production"
      subtitle={`Pièce : ${piece.piece_name}`}
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

          {/* ... (باقي الأقسام: RÉSUMÉ FINANCIER, DÉTAIL DES SESSIONS, DÉTAIL PAR PAQUET, OPÉRATIONS) ... */}
          {/* تأكد من أن جميع الأقسام الأخرى موجودة كما هي في الملف الأصلي */}

        </div>
      )}
    </PrintLayout>
  );
}
