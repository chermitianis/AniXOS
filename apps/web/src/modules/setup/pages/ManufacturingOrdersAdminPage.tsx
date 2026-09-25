import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Loader2, Package, FolderOpen, FileText, Clock, Cog, Wrench, Cpu,
  ChevronDown, ChevronRight, Printer, Search, ArrowRight,
  CheckCircle2, AlertTriangle, Calendar,
} from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { useNav } from "../../../app/NavContext";
import { STAGES, getStageDef, getStageInterface } from "../../nomenclature/lib/costingConstants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type OFStatus = "draft" | "prepared" | "scheduled" | "in_progress" | "completed" | "cancelled" | "confirmed" | "done";

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
}

interface OperationRow {
  id: string;
  stage: string;
  estimated_hours: number;
  hourly_rate: number;
  subtotal: number;
  sequence_order: number;
  machine_id: string | null;
  machine_name: string | null;
}

interface DocumentRow {
  id: string;
  doc_type: string;
  title: string;
  url: string;
}

// ---------------------------------------------------------------------------
// Constantes d'affichage
// ---------------------------------------------------------------------------

const STATUS_META: Record<string, { labelKey: string; color: string; icon: typeof Calendar }> = {
  draft:       { labelKey: "production.of.statusDraft",       color: "bg-slate-100 text-slate-600",   icon: Package },
  prepared:    { labelKey: "production.of.statusPrepared",    color: "bg-blue-100 text-blue-700",     icon: CheckCircle2 },
  scheduled:   { labelKey: "production.of.statusScheduled",   color: "bg-purple-100 text-purple-700", icon: Calendar },
  in_progress: { labelKey: "production.of.statusInProgress",  color: "bg-amber-100 text-amber-800",   icon: Clock },
  completed:   { labelKey: "production.of.statusCompleted",   color: "bg-green-100 text-green-700",   icon: CheckCircle2 },
  cancelled:   { labelKey: "production.of.statusCancelled",   color: "bg-red-100 text-red-700",       icon: AlertTriangle },
  // legacy
  confirmed:   { labelKey: "production.of.statusConfirmed",   color: "bg-slate-100 text-slate-500",   icon: Package },
  done:        { labelKey: "production.of.statusCompleted",   color: "bg-green-100 text-green-700",   icon: CheckCircle2 },
};

const FILTER_TABS: { key: OFStatus | "all"; labelKey: string }[] = [
  { key: "all",         labelKey: "production.of.filterAll" },
  { key: "prepared",    labelKey: "production.of.statusPrepared" },
  { key: "scheduled",   labelKey: "production.of.statusScheduled" },
  { key: "in_progress", labelKey: "production.of.statusInProgress" },
  { key: "completed",   labelKey: "production.of.statusCompleted" },
];

// ---------------------------------------------------------------------------
// Composant
// ---------------------------------------------------------------------------

export function ManufacturingOrdersAdminPage() {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();
  const nav = useNav();

  const [orders, setOrders] = useState<OfRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<OFStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [opCache, setOpCache] = useState<Record<string, OperationRow[]>>({});
  const [docCache, setDocCache] = useState<Record<string, DocumentRow[]>>({});
  const [loadingDetails, setLoadingDetails] = useState<string | null>(null);
  const [updatingOfId, setUpdatingOfId] = useState<string | null>(null);

  // ---------------------------------------------------------------------
  // Chargement liste
  // ---------------------------------------------------------------------
  const load = useCallback(async () => {
    if (!staffUser?.company_id) return;
    setIsLoading(true);
    setError(null);
    try {
      const { data: ofData, error: ofErr } = await supabase
        .from("manufacturing_orders")
        .select("*, projects(name, code, clients(name))")
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
        };
      });

      setOrders(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsLoading(false);
    }
  }, [staffUser?.company_id]);

  useEffect(() => {
    void load();
  }, [load]);

  // ---------------------------------------------------------------------
  // Chargement détails d'un OF
  // ---------------------------------------------------------------------
  async function loadOfDetails(of: OfRow) {
    if (!of.piece_task_id) return;
    setLoadingDetails(of.id);
    try {
      const [{ data: ops }, { data: docs }] = await Promise.all([
        supabase
          .from("piece_costing_operations")
          .select("id, stage, estimated_hours, hourly_rate, subtotal, sequence_order, machine_id")
          .eq("piece_task_id", of.piece_task_id)
          .order("sequence_order"),
        supabase
          .from("piece_documents")
          .select("id, doc_type, title, url")
          .eq("piece_task_id", of.piece_task_id)
          .order("created_at", { ascending: false }),
      ]);

      const opsList = (ops ?? []) as OperationRow[];

      const machineIds = Array.from(
        new Set(opsList.map((o) => o.machine_id).filter((id): id is string => !!id)),
      );
      const machineNames = new Map<string, string>();
      if (machineIds.length > 0) {
        const { data: machinesData } = await supabase
          .from("machines")
          .select("id, name, code")
          .in("id", machineIds);
        for (const m of (machinesData ?? []) as { id: string; name: string; code: string | null }[]) {
          machineNames.set(m.id, m.code ? `${m.code} — ${m.name}` : m.name);
        }
      }

      setOpCache((prev) => ({
        ...prev,
        [of.id]: opsList.map((o) => ({
          ...o,
          machine_name: o.machine_id ? machineNames.get(o.machine_id) ?? null : null,
        })),
      }));
      setDocCache((prev) => ({ ...prev, [of.id]: (docs ?? []) as DocumentRow[] }));
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
    if (!opCache[of.id] || !docCache[of.id]) {
      void loadOfDetails(of);
    }
  }

  // ---------------------------------------------------------------------
  // Actions autorisées
  // ---------------------------------------------------------------------

  /** Planifier : transition prepared → scheduled + redirection vers Planification.
   * ⚠️ Ne change PAS le statut manuellement — c'est PlanningAdminPage qui le fait
   * via son insert de planning (handleSave). Ce bouton navigue seulement. */
  function handleGoToPlanning(of: OfRow) {
    if (!of.piece_task_id) return;
    nav.goToSection("production_planification");
  }

  /** Annuler : disponible pour tout OF non terminé. */
  async function handleCancel(of: OfRow) {
    if (!window.confirm(t("production.of.confirmCancel"))) return;
    setUpdatingOfId(of.id);
    try {
      await supabase
        .from("manufacturing_orders")
        .update({ status: "cancelled" } as never)
        .eq("id", of.id);
      await load();
    } finally {
      setUpdatingOfId(null);
    }
  }

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
      prepared: orders.filter((o) => o.status === "prepared").length,
      scheduled: orders.filter((o) => o.status === "scheduled").length,
      inProgress: orders.filter((o) => o.status === "in_progress").length,
      completed: orders.filter((o) => o.status === "completed").length,
    }),
    [orders],
  );

  const countByFilter = (key: OFStatus | "all") =>
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
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={t("production.of.statusPrepared")} value={kpis.prepared} color="text-blue-600" />
        <KpiCard label={t("production.of.statusScheduled")} value={kpis.scheduled} color="text-purple-600" />
        <KpiCard label={t("production.of.statusInProgress")} value={kpis.inProgress} color="text-amber-600" />
        <KpiCard label={t("production.of.statusCompleted")} value={kpis.completed} color="text-green-600" />
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
            const ops = opCache[o.id] ?? [];
            const docs = docCache[o.id] ?? [];
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
                        OF-{o.order_number}
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
                                const iface = getStageInterface(op.stage);
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
                                    {op.machine_name ? (
                                      <span className="shrink-0 inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                                        {iface === "cnc" ? <Cpu size={9} /> : <Wrench size={9} />}
                                        {op.machine_name}
                                      </span>
                                    ) : (
                                      <span className="shrink-0 text-[10px] text-slate-400">
                                        {t("production.of.noMachine")}
                                      </span>
                                    )}
                                    <span className="shrink-0 font-bold text-slate-700" dir="ltr">
                                      {op.subtotal.toFixed(2)}
                                    </span>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </div>

                        {/* Documents */}
                        <div>
                          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                            <FileText size={12} />
                            {t("production.of.documents")} ({docs.length})
                          </div>
                          {docs.length === 0 ? (
                            <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-400">
                              {t("production.preparation.noDocuments")}
                            </p>
                          ) : (
                            <ul className="space-y-1">
                              {docs.map((d) => (
                                <li key={d.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs">
                                  <FileText size={11} className="shrink-0 text-slate-400" />
                                  <span className="min-w-0 flex-1 truncate text-slate-700">
                                    {d.title}
                                  </span>
                                  <a
                                    href={d.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="shrink-0 font-semibold text-indigo-600 hover:text-indigo-700"
                                  >
                                    {t("production.preparation.openDoc")} ↗
                                  </a>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>

                        {/* Actions — SEULEMENT : Print + Planifier + Annuler */}
                        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3 print:hidden">
                          <button
                            onClick={() => window.print()}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            <Printer size={12} />
                            {t("common.print")}
                          </button>

                          {o.status === "prepared" && (
                            <button
                              onClick={() => handleGoToPlanning(o)}
                              disabled={ops.length === 0}
                              title={ops.length === 0 ? t("production.planning.noOperationsBlocked") : undefined}
                              className="inline-flex items-center gap-1.5 rounded-lg bg-purple-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
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
                              {isUpdating ? <Loader2 size={12} className="animate-spin" /> : <AlertTriangle size={12} />}
                              {t("production.of.actionCancel")}
                            </button>
                          )}
                        </div>

                        {/* Bandeau informatif pour OF completed */}
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
      {kpis.scheduled > 0 && (
        <button
          onClick={() => nav.goToSection("production_planification")}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 py-3 text-sm font-bold text-indigo-700 hover:bg-indigo-100"
        >
          {t("production.of.gotoPlanning", { count: kpis.scheduled })}
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
      <div className="text-xs font-semibold uppercase text-slate-400">{label}</div>
      <div className={`mt-2 text-2xl font-extrabold ${color}`}>{value}</div>
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