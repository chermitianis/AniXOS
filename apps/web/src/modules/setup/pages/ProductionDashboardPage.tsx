import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Factory, Package, Clock, Play, CheckCircle2, AlertTriangle,
  Loader2, Calendar, TrendingUp, CircleDashed, Pause,
} from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { useNav } from "../../../app/NavContext";
import type { PieceTask, ManufacturingOrder } from "../../../shared/types/database";

type ProductionStatus =
  | "not_sent" | "sent" | "in_preparation" | "ready_to_start"
  | "scheduled" | "in_progress" | "completed" | "on_hold";

interface PieceWithContext extends PieceTask {
  production_status: ProductionStatus;
  project_name: string;
  project_code: string;
  client_name: string | null;
  due_date: string | null;
}

interface OfWithContext extends ManufacturingOrder {
  project_name: string;
  pieces_count: number;
  pieces_done: number;
}

const STATUS_META: Record<
  ProductionStatus,
  { label: string; color: string; icon: typeof CheckCircle2 }
> = {
  not_sent:       { label: "Non envoyé",       color: "bg-slate-100 text-slate-600",   icon: CircleDashed },
  sent:           { label: "Envoyé",           color: "bg-blue-100 text-blue-700",     icon: Package },
  in_preparation: { label: "En préparation",   color: "bg-amber-100 text-amber-700",   icon: Clock },
  ready_to_start: { label: "Prêt à démarrer",  color: "bg-indigo-100 text-indigo-700", icon: Play },
  scheduled:      { label: "Planifié",         color: "bg-purple-100 text-purple-700", icon: Calendar },
  in_progress:    { label: "En cours",         color: "bg-amber-100 text-amber-800",   icon: Play },
  completed:      { label: "Terminé",          color: "bg-green-100 text-green-700",   icon: CheckCircle2 },
  on_hold:        { label: "En pause",         color: "bg-orange-100 text-orange-700", icon: Pause },
};

export function ProductionDashboardPage() {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();
  const nav = useNav();

  const [pieces, setPieces] = useState<PieceWithContext[]>([]);
  const [orders, setOrders] = useState<OfWithContext[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setIsLoading(true);
    setError(null);
    try {
      const { data: piecesData, error: piecesErr } = await supabase
        .from("pieces_tasks")
        .select("*, projects(name, code, due_date, clients(name))")
        .neq("production_status", "not_sent")
        .order("sent_to_production_at", { ascending: false })
        .limit(200);

      if (piecesErr) throw piecesErr;

      const rows: PieceWithContext[] = ((piecesData ?? []) as Record<string, unknown>[]).map(
        (row) => {
          const proj = row.projects as {
            name?: string;
            code?: string;
            due_date?: string | null;
            clients?: { name?: string } | null;
          } | null;
          return {
            ...(row as unknown as PieceTask),
            production_status: (row.production_status as ProductionStatus) ?? "sent",
            project_name: proj?.name ?? "—",
            project_code: proj?.code ?? "—",
            client_name: proj?.clients?.name ?? null,
            due_date: proj?.due_date ?? null,
          };
        },
      );
      setPieces(rows);

      const { data: ordersData } = await supabase
        .from("manufacturing_orders")
        .select("*, projects(name)")
        .order("created_at", { ascending: false })
        .limit(100);

      const ordersWithCounts: OfWithContext[] = [];
      for (const o of (ordersData ?? []) as Record<string, unknown>[]) {
        const orderId = o.id as string;
        const { data: linked } = await supabase
          .from("pieces_tasks")
          .select("production_status")
          .eq("manufacturing_order_id", orderId);
        const linkedPieces = (linked ?? []) as { production_status: string }[];
        ordersWithCounts.push({
          ...(o as unknown as ManufacturingOrder),
          project_name: (o.projects as { name?: string } | null)?.name ?? "—",
          pieces_count: linkedPieces.length,
          pieces_done: linkedPieces.filter((p) => p.production_status === "completed").length,
        });
      }
      setOrders(ordersWithCounts);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffUser?.company_id]);

  const kpis = useMemo(
    () => ({
      waiting: pieces.filter((p) => p.production_status === "sent").length,
      ready: pieces.filter(
        (p) => p.production_status === "ready_to_start" || p.production_status === "scheduled",
      ).length,
      inProgress: pieces.filter((p) => p.production_status === "in_progress").length,
      late: pieces.filter(
        (p) =>
          p.due_date &&
          new Date(p.due_date) < new Date() &&
          p.production_status !== "completed",
      ).length,
    }),
    [pieces],
  );

  const sentPieces = useMemo(
    () => pieces.filter((p) => p.production_status === "sent"),
    [pieces],
  );
  const inProgressPieces = useMemo(
    () => pieces.filter((p) => p.production_status === "in_progress"),
    [pieces],
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Loader2 className="me-2 animate-spin" size={18} />
        {t("common.loading")}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard label={t("production.kpi.waiting")} value={kpis.waiting} icon={Package} color="text-blue-600" />
        <KpiCard label={t("production.kpi.ready")} value={kpis.ready} icon={Play} color="text-indigo-600" />
        <KpiCard label={t("production.kpi.inProgress")} value={kpis.inProgress} icon={TrendingUp} color="text-amber-600" />
        <KpiCard label={t("production.kpi.late")} value={kpis.late} icon={AlertTriangle} color="text-red-600" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          title={t("production.sections.waiting")}
          count={sentPieces.length}
          onOpen={() => nav.goToSection("production_preparation")}
          actionLabel={t("production.actions.preparer")}
          icon={Package}
        >
          <PieceList pieces={sentPieces} emptyMessage={t("production.empty.waiting")} />
        </Section>

        <Section title={t("production.sections.inProgress")} count={inProgressPieces.length} icon={Play}>
          <PieceList pieces={inProgressPieces} emptyMessage={t("production.empty.inProgress")} />
        </Section>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-700">
            {t("production.sections.orders")} ({orders.length})
          </h2>
          <button
            onClick={() => nav.goToSection("production_ordres")}
            className="text-xs font-bold text-indigo-600 hover:text-indigo-700"
          >
            {t("production.actions.viewAll")} →
          </button>
        </div>
        {orders.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-400">
            {t("production.empty.orders")}
          </p>
        ) : (
          <ul className="space-y-2">
            {orders.slice(0, 5).map((o) => (
              <li key={o.id} className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <Factory size={14} className="shrink-0 text-indigo-500" />
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-slate-700">
                    OF-{o.order_number} — {o.product_name}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                    <span>{o.project_name}</span>
                    <span>· {o.pieces_done}/{o.pieces_count} {t("production.piecesDone")}</span>
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                  {o.status}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function KpiCard({ label, value, icon: Icon, color }: { label: string; value: number; icon: typeof Package; color: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-400">
        <Icon size={13} className={color} />
        <span className="truncate">{label}</span>
      </div>
      <div className={`mt-2 text-2xl font-extrabold ${color}`}>{value}</div>
    </div>
  );
}

function Section({ title, count, icon: Icon, onOpen, actionLabel, children }: {
  title: string;
  count: number;
  icon: typeof Package;
  onOpen?: () => void;
  actionLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon size={15} className="text-indigo-600" />
          <h2 className="text-sm font-bold text-slate-700">
            {title} ({count})
          </h2>
        </div>
        {onOpen && actionLabel && (
          <button onClick={onOpen} className="shrink-0 text-xs font-bold text-indigo-600 hover:text-indigo-700">
            {actionLabel} →
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

function PieceList({ pieces, emptyMessage }: { pieces: PieceWithContext[]; emptyMessage: string }) {
    if (pieces.length === 0) {
      return <p className="py-4 text-center text-xs text-slate-400">{emptyMessage}</p>;
    }
    return (
      <ul className="max-h-80 space-y-1.5 overflow-y-auto">
        {pieces.slice(0, 20).map((p) => {
          // Fallback si la valeur en DB n'est pas reconnue
          const meta =
            STATUS_META[p.production_status] ?? STATUS_META["sent"];
          const Icon = meta.icon;
          return (
            <li key={p.id} className="flex items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-2 text-xs">
              <Package size={12} className="shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate font-semibold text-slate-700">{p.name}</span>
                  <span className="shrink-0 font-mono text-[10px] text-slate-400" dir="ltr">
                    {p.code ?? "—"}
                  </span>
                </div>
                <div className="mt-0.5 truncate text-[10px] text-slate-400">
                  {p.project_name} {p.client_name && `· ${p.client_name}`}
                </div>
              </div>
              <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${meta.color}`}>
                <Icon size={9} />
                {meta.label}
              </span>
            </li>
          );
        })}
      </ul>
    );
  }