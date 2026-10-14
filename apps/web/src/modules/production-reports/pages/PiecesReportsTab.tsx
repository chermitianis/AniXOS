import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Loader2, Boxes, ChevronDown, ChevronRight, TrendingUp, TrendingDown,
  Search, X, CheckCircle2, Clock,
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
  const [searchQuery, setSearchQuery] = useState("");

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

  // ✅ Filtrage instantané par nom ou code (insensible à la casse)
  const filteredPieces = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return pieces;
    return pieces.filter((p) => {
      const nameMatch = p.piece_name.toLowerCase().includes(q);
      const codeMatch = (p.piece_code ?? "").toLowerCase().includes(q);
      return nameMatch || codeMatch;
    });
  }, [pieces, searchQuery]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Loader2 className="me-2 animate-spin" size={18} />
        {t("common.loading")}
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* ═══════════════════════════════════════════════════════════ */}
      {/* BARRE DE RECHERCHE + COMPTEUR                                  */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <div className="space-y-2">
        <div className="relative">
          <Search
            size={16}
            className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("productionReports.pieces.searchPlaceholder", {
              defaultValue: "Rechercher une pièce (nom ou code)…",
            })}
            className="w-full rounded-lg border border-slate-200 bg-white py-2 ps-9 pe-9 text-sm text-slate-700 placeholder:text-slate-400 focus:border-blue-400 focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
              aria-label={t("common.clear", { defaultValue: "Effacer" })}
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="flex items-center justify-between text-xs text-slate-500">
          <span>
            {searchQuery.trim()
              ? t("productionReports.pieces.searchResults", {
                  count: filteredPieces.length,
                  defaultValue: "{{count}} résultat(s)",
                })
              : t("productionReports.pieces.countAll", {
                  count: pieces.length,
                  defaultValue: "{{count}} pièce(s) avec rapport",
                })}
          </span>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ÉTATS VIDES                                                     */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {pieces.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-400">
          <Boxes size={32} className="mx-auto mb-2 text-slate-300" />
          {t("productionReports.pieces.empty", {
            defaultValue: "Aucune pièce avec rapport pour le moment.",
          })}
        </div>
      ) : filteredPieces.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-400">
          <Search size={32} className="mx-auto mb-2 text-slate-300" />
          {t("productionReports.pieces.noSearchResults", {
            defaultValue: "Aucune pièce ne correspond à cette recherche.",
          })}
        </div>
      ) : (
        <ul className="space-y-2">
          {filteredPieces.map((p) => {
            const isOpen = expanded === p.piece_task_id;
            const variance = p.actual_seconds - p.estimated_seconds;
            const isOver = variance > 0;
            const isFullyDone = p.production_status === "completed";

            return (
              <li
                key={p.piece_task_id}
                className="overflow-hidden rounded-xl border border-slate-200 bg-white"
              >
                <button
                  type="button"
                  onClick={() => void toggleExpand(p.piece_task_id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-start hover:bg-slate-50"
                >
                  {isOpen ? (
                    <ChevronDown size={16} className="shrink-0 text-slate-400" />
                  ) : (
                    <ChevronRight size={16} className="shrink-0 text-slate-400" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-bold text-slate-800">
                        {p.piece_name}
                      </span>
                      {p.piece_code && (
                        <span className="font-mono text-[10px] text-slate-400" dir="ltr">
                          {p.piece_code}
                        </span>
                      )}
                      {/* Badge statut : Terminée ou Partielle */}
                      {isFullyDone ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-bold text-green-700">
                          <CheckCircle2 size={10} />
                          {t("productionReports.pieces.badgeCompleted", {
                            defaultValue: "Terminée",
                          })}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                          <Clock size={10} />
                          {t("productionReports.pieces.badgePartial", {
                            defaultValue: "Partielle",
                          })}
                        </span>
                      )}
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                        Qté {p.quantity}
                      </span>
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                      <span>{p.project_name}</span>
                      {p.project_code && <span>· {p.project_code}</span>}
                      {p.client_name && <span>· {p.client_name}</span>}
                    </div>
                  </div>
                  <div className="shrink-0 text-end">
                    <div
                      className={`flex items-center justify-end gap-1 text-xs font-bold ${
                        isOver ? "text-red-600" : "text-green-600"
                      }`}
                    >
                      {isOver ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                      {isOver ? "+" : "−"}
                      {fmtSec(Math.abs(variance))}
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-400" dir="ltr">
                      {fmtSec(p.actual_seconds)} / {fmtSec(p.estimated_seconds)}
                    </div>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100 bg-slate-50/50 p-4">
                    {/* DÉTAIL PAR PAQUET */}
                    <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                      {t("productionReports.pieces.workPackages")}
                    </h3>
                    {(wps[p.piece_task_id] ?? []).map((wp) => (
                      <div
                        key={wp.of_work_package_id}
                        className="mb-2 rounded-lg border border-slate-200 bg-white p-3 text-xs"
                      >
                        <div className="mb-2 flex items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              wp.interface_type === "cnc"
                                ? "bg-amber-100 text-amber-800"
                                : "bg-blue-100 text-blue-700"
                            }`}
                          >
                            {wp.interface_type.toUpperCase()}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              wp.status === "completed"
                                ? "bg-green-100 text-green-700"
                                : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            {wp.status}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-slate-600 sm:grid-cols-4">
                          <Stat
                            label={t("productionReports.pieces.estimated")}
                            value={
                              wp.estimated_hours > 0
                                ? `${wp.estimated_hours.toFixed(2)}h`
                                : "—"
                            }
                          />
                          <Stat
                            label={t("productionReports.pieces.actual")}
                            value={fmtSec(wp.actual_seconds)}
                          />
                          <Stat
                            label={t("productionReports.pieces.sessions")}
                            value={String(wp.sessions_count)}
                          />
                          <Stat
                            label={t("productionReports.pieces.workers")}
                            value={wp.worker_names ?? "—"}
                          />
                        </div>
                      </div>
                    ))}

                    {/* OPÉRATIONS */}
                    <h3 className="mt-4 mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                      {t("productionReports.pieces.operations")}
                    </h3>
                    <div className="space-y-3">
                      {(ops[p.piece_task_id] ?? []).map((op) => {
                        const estCost = op.estimated_hours * op.hourly_rate;
                        const actualHours = op.actual_seconds / 3600;
                        const hasActual = op.actual_seconds > 0;

                        const hoursEcart = op.estimated_hours - actualHours;
                        const costEcart = estCost - op.actual_cost;

                        const isSaving = costEcart >= 0;
                        const ecartClass = isSaving
                          ? "text-green-600"
                          : "text-red-600";
                        const ecartBg = isSaving ? "bg-green-50" : "bg-red-50";
                        const sign = (n: number) => (n >= 0 ? "+" : "−");

                        return (
                          <div
                            key={op.operation_id}
                            className="rounded-lg border border-slate-200 bg-white p-4"
                          >
                            <div className="mb-3 flex items-center justify-between gap-2">
                              <span className="text-sm font-bold text-slate-800">
                                {op.label ?? op.stage}
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                  op.interface_type === "cnc"
                                    ? "bg-amber-100 text-amber-800"
                                    : "bg-blue-100 text-blue-700"
                                }`}
                              >
                                {op.interface_type.toUpperCase()}
                              </span>
                            </div>

                            <div className="space-y-2 text-xs">
                              {/* Estimé */}
                              <div className="grid grid-cols-12 items-center gap-2">
                                <div className="col-span-3 font-semibold uppercase tracking-wide text-slate-400">
                                  {t("productionReports.pieces.opEstimatedShort", {
                                    defaultValue: "Estimé",
                                  })}
                                </div>
                                <div className="col-span-2 text-end font-mono font-semibold text-slate-700" dir="ltr">
                                  {op.estimated_hours.toFixed(2)}h
                                </div>
                                <div className="col-span-1 text-center text-slate-400">×</div>
                                <div className="col-span-2 text-end font-mono font-semibold text-slate-700" dir="ltr">
                                  {op.hourly_rate.toFixed(2)}
                                </div>
                                <div className="col-span-1 text-center text-slate-400">=</div>
                                <div className="col-span-3 text-end font-mono font-bold text-slate-800" dir="ltr">
                                  {estCost.toFixed(2)}
                                </div>
                              </div>

                              {/* Réel */}
                              {hasActual ? (
                                <div className="grid grid-cols-12 items-center gap-2">
                                  <div className="col-span-3 font-semibold uppercase tracking-wide text-slate-400">
                                    {t("productionReports.pieces.opActualShort", {
                                      defaultValue: "Réel",
                                    })}
                                  </div>
                                  <div className="col-span-2 text-end font-mono font-semibold text-slate-700" dir="ltr">
                                    {actualHours.toFixed(2)}h
                                  </div>
                                  <div className="col-span-1 text-center text-slate-400">×</div>
                                  <div className="col-span-2 text-end font-mono font-semibold text-slate-700" dir="ltr">
                                    {op.actual_hourly_rate != null
                                      ? op.actual_hourly_rate.toFixed(2)
                                      : "0.00"}
                                  </div>
                                  <div className="col-span-1 text-center text-slate-400">=</div>
                                  <div className="col-span-3 text-end font-mono font-bold text-slate-800" dir="ltr">
                                    {op.actual_cost.toFixed(2)}
                                  </div>
                                </div>
                              ) : (
                                <div className="grid grid-cols-12 items-center gap-2">
                                  <div className="col-span-3 font-semibold uppercase tracking-wide text-slate-400">
                                    {t("productionReports.pieces.opActualShort", {
                                      defaultValue: "Réel",
                                    })}
                                  </div>
                                  <div className="col-span-9 text-end text-slate-400">—</div>
                                </div>
                              )}

                              {/* Écart */}
                              {hasActual ? (
                                <div
                                  className={`grid grid-cols-12 items-center gap-2 rounded-md ${ecartBg} px-2 py-1.5 -mx-2`}
                                >
                                  <div className={`col-span-3 font-bold uppercase tracking-wide ${ecartClass}`}>
                                    {t("productionReports.pieces.opEcartShort", {
                                      defaultValue: "Écart",
                                    })}
                                  </div>
                                  <div className={`col-span-2 text-end font-mono font-bold ${ecartClass}`} dir="ltr">
                                    {sign(hoursEcart)}
                                    {Math.abs(hoursEcart).toFixed(2)}h
                                  </div>
                                  <div className="col-span-1 text-center" />
                                  <div className="col-span-2 text-center" />
                                  <div className={`col-span-1 text-center font-bold ${ecartClass}`}>=</div>
                                  <div className={`col-span-3 text-end font-mono font-bold ${ecartClass}`} dir="ltr">
                                    {sign(costEcart)}
                                    {Math.abs(costEcart).toFixed(2)}
                                  </div>
                                </div>
                              ) : (
                                <div className="grid grid-cols-12 items-center gap-2">
                                  <div className="col-span-3 font-semibold uppercase tracking-wide text-slate-400">
                                    {t("productionReports.pieces.opEcartShort", {
                                      defaultValue: "Écart",
                                    })}
                                  </div>
                                  <div className="col-span-9 text-end text-slate-400">—</div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-0.5 truncate font-semibold text-slate-700">{value}</div>
    </div>
  );
}
