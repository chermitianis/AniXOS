import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Loader2, Package, FileText, Clock, Cog, Wrench, Cpu,
  ChevronDown, ChevronRight, Printer, Search, ArrowRight,
  CheckCircle2, AlertTriangle, Calendar, Layers,
} from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { useNav } from "../../../app/NavContext";
import { getStageDef, getStageInterface } from "../../nomenclature/lib/costingConstants";
import type {
  ManufacturingOrder,
  OfOperation,
  OfWorkPackage,
} from "../../../shared/types/database";

// ---------------------------------------------------------------------------
// Types locaux
// ---------------------------------------------------------------------------
type OFStatus =
  | "draft" | "preparing" | "ready" | "scheduled"
  | "in_progress" | "completed" | "cancelled";

interface OfRow {
  id: string;
  order_number: string;
  product_name: string;
  quantity: number;
  status: OFStatus;
  piece_task_id: string | null;
  project_id: string;
  project_name: string;
  project_code: string;
  client_name: string | null;
  prepared_at: string | null;
  scheduled_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  piece_code: string | null;
  piece_name: string | null;
  piece_status: string | null;
  piece_primary_op: string | null;
  technical_drawing_url: string | null;
  technical_drawing_path_local: string | null;
  technical_drawing_path_network: string | null;
  notes: string | null;
}

interface OfDetails {
  operations: OfOperation[];
  work_packages: OfWorkPackage[];
}

// ---------------------------------------------------------------------------
// Constantes d'affichage
// ---------------------------------------------------------------------------
const STATUS_META: Record<string, { labelKey: string; color: string; icon: typeof Calendar }> = {
  draft:       { labelKey: "production.of.statusDraft",     color: "bg-slate-100 text-slate-600",   icon: Package },
  preparing:   { labelKey: "production.of.statusPreparing", color: "bg-amber-100 text-amber-700",   icon: Clock },
  ready:       { labelKey: "production.of.statusReady",     color: "bg-blue-100 text-blue-700",     icon: CheckCircle2 },
  scheduled:   { labelKey: "production.of.statusScheduled", color: "bg-purple-100 text-purple-700", icon: Calendar },
  in_progress: { labelKey: "production.of.statusInProgress",color: "bg-indigo-100 text-indigo-700", icon: Clock },
  completed:   { labelKey: "production.of.statusCompleted", color: "bg-green-100 text-green-700",   icon: CheckCircle2 },
  cancelled:   { labelKey: "production.of.statusCancelled", color: "bg-red-100 text-red-700",       icon: AlertTriangle },
};

type FilterKey = OFStatus | "all";

const FILTER_TABS: { key: FilterKey; labelKey: string }[] = [
  { key: "all",         labelKey: "production.of.tabAll" },
  { key: "preparing",   labelKey: "production.of.tabPreparing" },
  { key: "ready",       labelKey: "production.of.tabReady" },
  { key: "scheduled",   labelKey: "production.of.tabScheduled" },
  { key: "in_progress", labelKey: "production.of.tabInProgress" },
  { key: "completed",   labelKey: "production.of.tabCompleted" },
];

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------
export function ManufacturingOrdersAdminPage() {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();
  const nav = useNav();
  const companyId = staffUser?.company_id ?? null;

  const [orders, setOrders] = useState<OfRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [detailsCache, setDetailsCache] = useState<Record<string, OfDetails>>({});
  const [loadingDetails, setLoadingDetails] = useState<string | null>(null);
  const [updatingOfId, setUpdatingOfId] = useState<string | null>(null);

  // ---------------------------------------------------------------------
  // Chargement liste
  // ---------------------------------------------------------------------
  const load = useCallback(async () => {
    if (!companyId) return;
    setIsLoading(true);
    setError(null);
    try {
      const { data: ofData, error: ofErr } = await supabase
        .from("manufacturing_orders")
        .select("*, projects(name, code, clients(name))")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false });

      if (ofErr) throw ofErr;

      const pieceIds = ((ofData ?? []) as { piece_task_id: string | null }[])
        .map((o) => o.piece_task_id)
        .filter((id): id is string => !!id);

      const piecesMap = new Map<
        string,
        {
          code: string | null;
          name: string;
          production_status: string | null;
          primary_operation_type: string | null;
        }
      >();

      if (pieceIds.length > 0) {
        const { data: piecesData } = await supabase
          .from("pieces_tasks")
          .select("id, code, name, production_status, primary_operation_type")
          .eq("company_id", companyId)
          .in("id", pieceIds);

        for (const p of (piecesData ?? []) as {
          id: string;
          code: string | null;
          name: string;
          production_status: string | null;
          primary_operation_type: string | null;
        }[]) {
          piecesMap.set(p.id, {
            code: p.code,
            name: p.name,
            production_status: p.production_status,
            primary_operation_type: p.primary_operation_type,
          });
        }
      }

      const rows: OfRow[] = ((ofData ?? []) as Record<string, unknown>[]).map((row) => {
        const proj = row.projects as {
          name?: string;
          code?: string;
          clients?: { name?: string } | null;
        } | null;
        const pieceId = row.piece_task_id as string | null;
        const piece = pieceId ? piecesMap.get(pieceId) : undefined;

        return {
          id: row.id as string,
          order_number: row.order_number as string,
          product_name: row.product_name as string,
          quantity: row.quantity as number,
          status: row.status as OFStatus,
          piece_task_id: pieceId,
          project_id: row.project_id as string,
          project_name: proj?.name ?? "—",
          project_code: proj?.code ?? "—",
          client_name: proj?.clients?.name ?? null,
          prepared_at: row.prepared_at as string | null,
          scheduled_at: row.scheduled_at as string | null,
          started_at: row.started_at as string | null,
          completed_at: row.completed_at as string | null,
          created_at: row.created_at as string,
          piece_code: piece?.code ?? null,
          piece_name: piece?.name ?? null,
          piece_status: piece?.production_status ?? null,
          piece_primary_op: piece?.primary_operation_type ?? null,
          technical_drawing_url: row.technical_drawing_url as string | null,
          technical_drawing_path_local: row.technical_drawing_path_local as string | null,
          technical_drawing_path_network: row.technical_drawing_path_network as string | null,
          notes: row.notes as string | null,
        };
      });

      setOrders(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  // ---------------------------------------------------------------------
  // Chargement détails d'un OF (depuis of_operations + of_work_packages)
  // ---------------------------------------------------------------------
  async function loadOfDetails(of: OfRow) {
    if (!companyId) return;
    setLoadingDetails(of.id);
    try {
      const [{ data: ops }, { data: wps }] = await Promise.all([
        supabase
          .from("of_operations")
          .select("*")
          .eq("company_id", companyId)
          .eq("manufacturing_order_id", of.id)
          .order("sequence_order"),
        supabase
          .from("of_work_packages")
          .select("*")
          .eq("company_id", companyId)
          .eq("manufacturing_order_id", of.id),
      ]);

      setDetailsCache((prev) => ({
        ...prev,
        [of.id]: {
          operations: (ops as OfOperation[]) ?? [],
          work_packages: (wps as OfWorkPackage[]) ?? [],
        },
      }));
    } finally {
      setLoadingDetails(null);
    }
  }

  function toggleExpand(of: OfRow) {
    if (expandedId === of.id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(of.id);
    if (!detailsCache[of.id]) void loadOfDetails(of);
  }

  // ---------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------
  async function handleCancel(of: OfRow) {
    if (!companyId) return;
    if (!window.confirm(t("production.of.confirmCancel"))) return;
    setUpdatingOfId(of.id);
    try {
      await supabase
        .from("manufacturing_orders")
        .update({ status: "cancelled" } as never)
        .eq("id", of.id)
        .eq("company_id", companyId);
      await load();
    } finally {
      setUpdatingOfId(null);
    }
  }

  function handleOpenInPreparation(of: OfRow) {
    if (!of.piece_task_id) return;
    nav.goToSection("production_preparation");
  }

  function handleGoToPlanning() {
    nav.goToSection("production_planification");
  }

  /** Ouvre le dessin technique : essaie local → réseau → url */
  function openDrawing(of: OfRow) {
    if (of.technical_drawing_path_local) {
      window.open(`file:///${of.technical_drawing_path_local.replace(/\\/g, "/")}`, "_blank");
      return;
    }
    if (of.technical_drawing_path_network) {
      window.open(`file://${of.technical_drawing_path_network}`, "_blank");
      return;
    }
    if (of.technical_drawing_url) {
      window.open(of.technical_drawing_url, "_blank");
    }
  }

  const hasDrawing = (of: OfRow) =>
    !!(of.technical_drawing_url || of.technical_drawing_path_local || of.technical_drawing_path_network);

  // ---------------------------------------------------------------------
  // Filtrage
  // ---------------------------------------------------------------------
  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (activeFilter !== "all" && o.status !== activeFilter) return false;
      if (q) {
        const inText =
          o.order_number.toLowerCase().includes(q) ||
          o.product_name.toLowerCase().includes(q) ||
          (o.piece_code ?? "").toLowerCase().includes(q) ||
          o.project_name.toLowerCase().includes(q);
        if (!inText) return false;
      }
      return true;
    });
  }, [orders, activeFilter, search]);

  const kpis = useMemo(
    () => ({
      preparing: orders.filter((o) => o.status === "preparing").length,
      ready: orders.filter((o) => o.status === "ready").length,
      scheduled: orders.filter((o) => o.status === "scheduled").length,
      inProgress: orders.filter((o) => o.status === "in_progress").length,
      completed: orders.filter((o) => o.status === "completed").length,
    }),
    [orders],
  );

  const countByFilter = (key: FilterKey) =>
    key === "all" ? orders.length : orders.filter((o) => o.status === key).length;

  // ---------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Loader2 className="me-2 animate-spin" size={18} />
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard label={t("production.of.tabPreparing")} value={kpis.preparing} color="text-amber-600" />
        <KpiCard label={t("production.of.tabReady")} value={kpis.ready} color="text-blue-600" />
        <KpiCard label={t("production.of.tabScheduled")} value={kpis.scheduled} color="text-purple-600" />
        <KpiCard label={t("production.of.tabInProgress")} value={kpis.inProgress} color="text-indigo-600" />
        <KpiCard label={t("production.of.tabCompleted")} value={kpis.completed} color="text-green-600" />
      </div>

      {/* Recherche */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("common.search")}
            className="w-full rounded-lg border border-slate-300 py-2 ps-8 pe-3 text-xs focus:border-indigo-400 focus:outline-none"
          />
        </div>
      </div>

      {/* Tabs filtre */}
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {FILTER_TABS.map((tab) => {
          const active = activeFilter === tab.key;
          const count = countByFilter(tab.key);
          return (
            <button
              key={tab.key}
              onClick={() => setActiveFilter(tab.key)}
              className={`shrink-0 whitespace-nowrap px-3 py-2 text-xs font-semibold transition-colors ${
                active
                  ? "border-b-2 border-indigo-600 text-indigo-600"
                  : "text-slate-400 hover:text-slate-600"
              }`}
            >
              {t(tab.labelKey)}
              <span
                className={`ms-1.5 rounded-full px-1.5 py-0.5 text-[10px] ${
                  active ? "bg-indigo-100 text-indigo-700" : "bg-slate-100 text-slate-500"
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Liste */}
      {filteredOrders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center text-sm text-slate-400">
          <Package size={32} className="mx-auto mb-3 text-slate-300" />
          {orders.length === 0
            ? t("production.of.emptyAll")
            : t("production.of.emptyFilter")}
        </div>
      ) : (
        <ul className="space-y-2">
          {filteredOrders.map((o) => {
            const meta = STATUS_META[o.status] ?? STATUS_META.draft;
            const MetaIcon = meta.icon;
            const isOpen = expandedId === o.id;
            const details = detailsCache[o.id];
            const ops = details?.operations ?? [];
            const wps = details?.work_packages ?? [];
            const isDetailLoading = loadingDetails === o.id;
            const isUpdating = updatingOfId === o.id;

            return (
              <li key={o.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                <button
                  type="button"
                  onClick={() => toggleExpand(o)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-slate-50"
                >
                  {isOpen ? (
                    <ChevronDown size={16} className="shrink-0 text-slate-400" />
                  ) : (
                    <ChevronRight size={16} className="shrink-0 text-slate-400" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-slate-500" dir="ltr">
                        {o.order_number}
                      </span>
                      <span className="truncate text-sm font-bold text-slate-800">
                        {o.product_name || o.piece_name || "—"}
                      </span>
                      {o.piece_code && (
                        <span className="shrink-0 font-mono text-[10px] text-slate-400" dir="ltr">
                          {o.piece_code}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                      <span>{o.project_name}</span>
                      {o.client_name && <span>· {o.client_name}</span>}
                      <span>· Qté {o.quantity}</span>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${meta.color}`}
                  >
                    <MetaIcon size={10} />
                    {t(meta.labelKey)}
                  </span>
                </button>

                {isOpen && (
                  <div className="border-t border-slate-100 px-4 py-3">
                    {isDetailLoading ? (
                      <div className="py-4 text-center">
                        <Loader2 size={16} className="mx-auto animate-spin text-slate-300" />
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {/* Métadonnées */}
                        <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
                          <Meta label={t("production.of.preparedAt")} value={o.prepared_at} />
                          <Meta label={t("production.of.scheduledAt")} value={o.scheduled_at} />
                          <Meta label={t("production.of.startedAt")} value={o.started_at} />
                          <Meta label={t("production.of.completedAt")} value={o.completed_at} />
                        </div>

                        {/* Work packages */}
                        <div>
                          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                            <Layers size={12} />
                            {t("production.of.workPackages")} ({wps.length})
                          </div>
                          {wps.length === 0 ? (
                            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-400">
                              {t("production.of.noWorkPackages")}
                            </p>
                          ) : (
                            <ul className="flex flex-wrap gap-1.5">
                              {wps.map((wp) => (
                                <li
                                  key={wp.id}
                                  className="flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold"
                                >
                                  <span
                                    className={`rounded-full px-1.5 py-0.5 font-bold ${
                                      wp.interface_type === "cnc"
                                        ? "bg-amber-200 text-amber-800"
                                        : "bg-blue-200 text-blue-800"
                                    }`}
                                  >
                                    {String(wp.interface_type).toUpperCase()}
                                  </span>
                                  <span className="text-slate-600">
                                    {wp.status === "pending" && "En attente"}
                                    {wp.status === "in_progress" && "En cours"}
                                    {wp.status === "completed" && "Terminé"}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>

                        {/* Opérations */}
                        <div>
                          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                            <Cog size={12} />
                            {t("production.of.operations")} ({ops.length})
                          </div>
                          {ops.length === 0 ? (
                            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                              {t("production.of.noOps")}
                            </p>
                          ) : (
                            <ul className="space-y-1">
                              {ops.map((op, idx) => {
                                const def = getStageDef(op.stage as never);
                                const iface = op.interface_type as "cnc" | "classique";
                                return (
                                  <li
                                    key={op.id}
                                    className="flex flex-wrap items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs"
                                  >
                                    <span className="shrink-0 text-slate-400">{idx + 1}</span>
                                    <span className="shrink-0">{def.icon}</span>
                                    <span className="min-w-0 flex-1 truncate font-semibold text-slate-700">
                                      {t(def.labelKey)}
                                    </span>
                                    <span
                                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                                        iface === "cnc"
                                          ? "bg-amber-100 text-amber-800"
                                          : "bg-blue-100 text-blue-700"
                                      }`}
                                    >
                                      {iface.toUpperCase()}
                                    </span>
                                    <span className="shrink-0 font-mono text-[10px] text-slate-500" dir="ltr">
                                      {op.estimated_hours}h × {op.hourly_rate}
                                    </span>
                                    <span className="shrink-0 font-bold text-slate-700" dir="ltr">
                                      {Number(op.subtotal).toFixed(2)}
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>

                        {/* Dessin technique */}
                        {hasDrawing(o) && (
                          <div>
                            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                              <FileText size={12} />
                              {t("production.of.documents")}
                            </div>
                            <button
                              onClick={() => openDrawing(o)}
                              className="flex w-full items-center gap-2 rounded-lg bg-indigo-50 px-3 py-2 text-xs font-semibold text-indigo-700 hover:bg-indigo-100"
                            >
                              <FileText size={12} />
                              <span className="truncate">
                                {o.technical_drawing_path_local ||
                                 o.technical_drawing_path_network ||
                                 o.technical_drawing_url}
                              </span>
                              <ArrowRight size={12} className="ms-auto shrink-0" />
                            </button>
                          </div>
                        )}

                        {o.notes && (
                          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
                            <span className="font-bold text-slate-500">Notes :</span> {o.notes}
                          </div>
                        )}

                        {/* Actions */}
                        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 print:hidden">
                          <button
                            onClick={() => window.print()}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            <Printer size={12} />
                            {t("common.print")}
                          </button>

                          {o.status === "preparing" && (
                            <button
                              onClick={() => handleOpenInPreparation(o)}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-600"
                            >
                              <Clock size={12} />
                              {t("production.of.actionContinuePreparation")}
                              <ArrowRight size={11} />
                            </button>
                          )}

                          {o.status === "ready" && (
                            <button
                              onClick={handleGoToPlanning}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-700"
                            >
                              <Calendar size={12} />
                              {t("production.of.actionSchedule")}
                              <ArrowRight size={11} />
                            </button>
                          )}

                          {o.status !== "cancelled" && o.status !== "completed" && (
                            <button
                              onClick={() => void handleCancel(o)}
                              disabled={isUpdating}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                            >
                              {isUpdating ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <AlertTriangle size={12} />
                              )}
                              {t("production.of.actionCancel")}
                            </button>
                          )}
                        </div>

                        {o.status === "completed" && (
                          <div className="rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-xs text-green-700">
                            <CheckCircle2 size={12} className="inline me-1.5" />
                            {t("production.of.allDone")}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Lien vers Planification si OFs prêts */}
      {kpis.ready > 0 && (
        <button
          onClick={handleGoToPlanning}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 py-3 text-sm font-bold text-indigo-700 hover:bg-indigo-100"
        >
          {t("production.of.gotoPlanning", { count: kpis.ready })}
          <ArrowRight size={14} />
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sous-composants
// ---------------------------------------------------------------------------
function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="text-[11px] font-semibold uppercase text-slate-400">{label}</div>
      <div className={`mt-1.5 text-2xl font-extrabold ${color}`}>{value}</div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
        {label}
      </div>
      <div className="mt-0.5 truncate text-xs font-semibold text-slate-700" dir="ltr">
        {value ? new Date(value).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—"}
      </div>
    </div>
  );
}