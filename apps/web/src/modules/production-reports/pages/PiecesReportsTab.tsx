import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Loader2, Boxes, ChevronDown, ChevronRight, TrendingUp, TrendingDown,
} from "lucide-react";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import {
  listCompletedPieces,
  getPieceWorkPackages,
  getPieceOperations,
  type PieceReportHeader,
  type PieceWpRow,
  type PieceOpRow,
} from "../api/productionReportsApi";

export function PiecesReportsTab() {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();
  const companyId = staffUser?.company_id ?? null;

  const [pieces, setPieces] = useState<PieceReportHeader[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [wps, setWps] = useState<Record<string, PieceWpRow[]>>({});
  const [ops, setOps] = useState<Record<string, PieceOpRow[]>>({});

  useEffect(() => {
    if (!companyId) return;
    setIsLoading(true);
    void listCompletedPieces(companyId)
      .then(setPieces)
      .catch((err) => setError(err instanceof Error ? err.message : "Erreur"))
      .finally(() => setIsLoading(false));
  }, [companyId]);

  async function toggleExpand(pieceId: string) {
    if (expanded === pieceId) {
      setExpanded(null);
      return;
    }
    setExpanded(pieceId);
    if (!companyId) return;
    if (!wps[pieceId]) {
      const w = await getPieceWorkPackages(companyId, pieceId);
      setWps((prev) => ({ ...prev, [pieceId]: w }));
    }
    if (!ops[pieceId]) {
      const o = await getPieceOperations(companyId, pieceId);
      setOps((prev) => ({ ...prev, [pieceId]: o }));
    }
  }

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
  if (pieces.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-400">
        <Boxes size={32} className="mx-auto mb-2 text-slate-300" />
        {t("productionReports.pieces.empty")}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-xs text-slate-500">
        {t("productionReports.pieces.count", { count: pieces.length })}
      </div>
      <ul className="space-y-2">
        {pieces.map((p) => {
          const isOpen = expanded === p.piece_task_id;
          const variance = p.actual_seconds - p.estimated_seconds;
          const isOver = variance > 0;
          return (
            <li key={p.piece_task_id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              <button
                type="button"
                onClick={() => void toggleExpand(p.piece_task_id)}
                className="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-slate-50"
              >
                {isOpen ? <ChevronDown size={16} className="shrink-0 text-slate-400" /> : <ChevronRight size={16} className="shrink-0 text-slate-400" />}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-bold text-slate-800">{p.piece_name}</span>
                    {p.piece_code && <span className="font-mono text-[10px] text-slate-400" dir="ltr">{p.piece_code}</span>}
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">Qté {p.quantity}</span>
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                    <span>{p.project_name}</span>
                    {p.project_code && <span>· {p.project_code}</span>}
                    {p.client_name && <span>· {p.client_name}</span>}
                  </div>
                </div>
                <div className="shrink-0 text-end">
                  <div className={`flex items-center justify-end gap-1 text-xs font-bold ${isOver ? "text-red-600" : "text-green-600"}`}>
                    {isOver ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                    {isOver ? "+" : ""}{fmtSec(Math.abs(variance))}
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-400" dir="ltr">
                    {fmtSec(p.actual_seconds)} / {fmtSec(p.estimated_seconds)}
                  </div>
                </div>
              </button>

              {isOpen && (
                <div className="border-t border-slate-100 bg-slate-50/50 p-4">
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                    {t("productionReports.pieces.workPackages")}
                  </h3>
                  {(wps[p.piece_task_id] ?? []).map((wp) => (
                    <div key={wp.of_work_package_id} className="mb-2 rounded-lg border border-slate-200 bg-white p-3 text-xs">
                      <div className="mb-2 flex items-center gap-2">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          wp.interface_type === "cnc" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-700"
                        }`}>{wp.interface_type.toUpperCase()}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          wp.status === "completed" ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-600"
                        }`}>{wp.status}</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-slate-600 sm:grid-cols-4">
                        <Stat label={t("productionReports.pieces.estimated")} value={wp.estimated_hours > 0 ? `${wp.estimated_hours.toFixed(2)}h` : "—"} />
                        <Stat label={t("productionReports.pieces.actual")} value={fmtSec(wp.actual_seconds)} />
                        <Stat label={t("productionReports.pieces.sessions")} value={String(wp.sessions_count)} />
                        <Stat label={t("productionReports.pieces.workers")} value={wp.worker_names ?? "—"} />
                      </div>
                    </div>
                  ))}

                  <h3 className="mt-4 mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                    {t("productionReports.pieces.operations")}
                  </h3>
                  <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-[10px] uppercase text-slate-500">
                        <tr>
                          <th className="px-2 py-1.5 text-start">{t("productionReports.pieces.opStage")}</th>
                          <th className="px-2 py-1.5 text-start">{t("productionReports.pieces.opInterface")}</th>
                          <th className="px-2 py-1.5 text-end">{t("productionReports.pieces.opEstimated")}</th>
                          <th className="px-2 py-1.5 text-end">{t("productionReports.pieces.opRate")}</th>
                          <th className="px-2 py-1.5 text-end">{t("productionReports.pieces.opSubtotal")}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {(ops[p.piece_task_id] ?? []).map((op) => (
                          <tr key={op.operation_id}>
                            <td className="px-2 py-1.5 text-slate-700">{op.label ?? op.stage}</td>
                            <td className="px-2 py-1.5">
                              <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                                op.interface_type === "cnc" ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-700"
                              }`}>{op.interface_type.toUpperCase()}</span>
                            </td>
                            <td className="px-2 py-1.5 text-end font-mono text-slate-600" dir="ltr">{op.estimated_hours.toFixed(2)}h</td>
                            <td className="px-2 py-1.5 text-end font-mono text-slate-600" dir="ltr">{op.hourly_rate.toFixed(2)}</td>
                            <td className="px-2 py-1.5 text-end font-mono font-bold text-slate-700" dir="ltr">{op.estimated_subtotal.toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</div>
      <div className="mt-0.5 truncate font-semibold text-slate-700">{value}</div>
    </div>
  );
}