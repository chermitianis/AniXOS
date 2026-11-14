import { useEffect, useState, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Loader2, Search, Eye, Package,
} from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import { useNav } from "../../../app/NavContext";

interface OrderRow {
  id: string;
  name: string;
  client_name: string | null;
  due_date: string | null;
  status: string;
  odoo_id: number | null;
  created_at: string;
  project_id: string | null;
  project_code: string | null;
  description: string | null;
}

export function OrdersAdminPage() {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();
  const { goToSection } = useNav();
  const companyId = staffUser?.company_id ?? null;

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    setIsLoading(true);
    void (async () => {
      try {
        const { data, error: err } = await supabase
          .from("projects")
          .select(`
            id, name, code, description, status, due_date, odoo_id, created_at,
            clients ( name )
          `)
          .eq("company_id", companyId)
          .neq("is_archived", true)
          .in("status", ["approved", "ready_for_production", "in_production", "completed"])
          .order("created_at", { ascending: false });

        if (err) throw err;

        const rows: OrderRow[] = ((data ?? []) as Record<string, unknown>[]).map((row) => {
          const client = row.clients as { name?: string } | null;
          return {
            id: row.id as string,
            name: row.name as string,
            client_name: client?.name ?? null,
            due_date: row.due_date as string | null,
            status: row.status as string,
            odoo_id: row.odoo_id as number | null,
            created_at: row.created_at as string,
            project_id: row.id as string,
            project_code: row.code as string | null,
            description: row.description as string | null,
          };
        });
        setOrders(rows);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur");
      } finally {
        setIsLoading(false);
      }
    })();
  }, [companyId]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        (o.client_name ?? "").toLowerCase().includes(q) ||
        (o.project_code ?? "").toLowerCase().includes(q),
    );
  }, [orders, search]);

  const statusBadge = (status: string) => {
    const map: Record<string, { label: string; color: string }> = {
      approved: { label: "Approuvé", color: "bg-blue-100 text-blue-700" },
      ready_for_production: { label: "Prêt pour production", color: "bg-indigo-100 text-indigo-700" },
      in_production: { label: "En production", color: "bg-emerald-100 text-emerald-700" },
      completed: { label: "Terminé", color: "bg-green-100 text-green-700" },
    };
    const info = map[status] ?? { label: status, color: "bg-slate-100 text-slate-600" };
    return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${info.color}`}>{info.label}</span>;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <Loader2 className="me-2 animate-spin" size={18} />
        {t("common.loading", { defaultValue: "Chargement..." })}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold text-slate-800">
          {t("orders.title", { defaultValue: "Commandes" })}
        </h1>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-bold text-slate-600">
          {filteredOrders.length}
        </span>
        <div className="relative ms-auto max-w-xs flex-1">
          <Search size={14} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("common.search", { defaultValue: "Rechercher..." })}
            className="w-full rounded-lg border border-slate-300 py-2 ps-8 pe-3 text-xs focus:border-blue-500 focus:outline-none"
          />
        </div>
      </div>

      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>}

      {/* Tableau */}
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-100">
                {[
                  t("orders.colNumber", { defaultValue: "N° Commande" }),
                  t("orders.colClient", { defaultValue: "Client" }),
                  t("orders.colProduct", { defaultValue: "Produit" }),
                  t("orders.colDate", { defaultValue: "Date" }),
                  t("orders.colDue", { defaultValue: "Échéance" }),
                  t("orders.colStatus", { defaultValue: "Statut" }),
                  t("orders.colProject", { defaultValue: "Projet lié" }),
                  "",
                ].map((label, i) => (
                  <th
                    key={i}
                    className="px-4 py-3 text-[10px] font-bold uppercase tracking-wider text-slate-400"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredOrders.map((order) => (
                <tr key={order.id} className="border-b border-slate-50 hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <span className="font-mono text-xs font-semibold text-slate-700" dir="ltr">
                      {order.name}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {order.client_name ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-600">
                    {order.description ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {order.created_at
                      ? new Date(order.created_at).toLocaleDateString("fr-FR")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-xs text-slate-500">
                    {order.due_date
                      ? new Date(order.due_date).toLocaleDateString("fr-FR")
                      : "—"}
                  </td>
                  <td className="px-4 py-3">{statusBadge(order.status)}</td>
                  <td className="px-4 py-3">
                    {order.project_code ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                        <Package size={10} />
                        {order.project_code}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-end">
                    <button
                      type="button"
                      onClick={() => {
                        goToSection("order_detail", { projectId: order.project_id || order.id });
                      }}
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-700 hover:bg-slate-200"
                    >
                      <Eye size={10} />
                      {t("orders.viewProject", { defaultValue: "Voir" })}
                    </button>
                  </td>
                </tr>
              ))}
              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-sm text-slate-400">
                    {t("orders.empty", { defaultValue: "Aucune commande trouvée" })}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}