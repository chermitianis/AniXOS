import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { TrendingUp, Activity, AlertTriangle, PackageX } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { createSafeChannel } from "../../../lib/realtimeChannel";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import type { ProjectProfitability, InventoryItem } from "../../../shared/types/database";

/** صف من v_live_operations — نُعرّفه محلياً (بدل الاعتماد على النوع المولّد
 * القديم) لأنه يتضمن الآن عمود piece_name المُضاف في migration 0050 */
interface LiveOperationRow {
  session_id: string;
  worker_id: string;
  worker_name: string;
  machine_id: string | null;
  machine_name: string | null;
  project_id: string | null;
  project_name: string | null;
  piece_task_id: string | null;
  piece_name: string | null;
  started_at: string;
  elapsed_seconds: number | null;
}

const RISK_LABEL_KEYS: Record<string, { key: string; className: string }> = {
  on_track: { key: "setup.riskOnTrack", className: "bg-green-100 text-green-700" },
  at_risk: { key: "setup.riskAtRisk", className: "bg-amber-100 text-amber-700" },
  delayed: { key: "setup.riskDelayed", className: "bg-red-100 text-red-700" },
  completed: { key: "setup.riskCompleted", className: "bg-slate-200 text-slate-600" },
};

/** القيمة الافتراضية عند غياب risk_status */
const DEFAULT_RISK = { key: "setup.riskOnTrack", className: "bg-green-100 text-green-700" };

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export function ManagerDashboardPage() {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();
  const [profitability, setProfitability] = useState<ProjectProfitability[]>([]);
  const [liveOps, setLiveOps] = useState<LiveOperationRow[]>([]);
  const [lowStock, setLowStock] = useState<InventoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadDashboard = useCallback(async () => {
    const [{ data: profit }, { data: live }, { data: stock }] = await Promise.all([
      supabase.from("v_project_profitability").select("*").order("net_profit", { ascending: true }),
      supabase.from("v_live_operations").select("*").order("started_at", { ascending: false }),
      supabase.from("v_inventory_low_stock").select("*"),
    ]);

    setProfitability((profit as ProjectProfitability[]) ?? []);
    setLiveOps((live as LiveOperationRow[]) ?? []);
    setLowStock((stock as InventoryItem[]) ?? []);
    setIsLoading(false);
  }, []);

  useEffect(() => {
    void loadDashboard();
    // فحص احتياطي كل 15 ثانية (شبكة غير مستقرة مثلاً) — التحديث الفعلي يأتي فورياً عبر Realtime أدناه
    const interval = setInterval(loadDashboard, 15_000);
    return () => clearInterval(interval);
  }, [loadDashboard]);

  // بث حي: أي بداية/نهاية جلسة إنتاج (دخول/خروج عامل، تبديل مهمة) تُحدّث
  // "المشاهدة الحية" فوراً — بلا انتظار الـ 15 ثانية — لتختفي الجلسة مباشرة
  // من اللوحة عند تسجيل الخروج
  useEffect(() => {
    if (!staffUser?.company_id) return;
    const channel = createSafeChannel(`live-ops-${staffUser.company_id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_sessions", filter: `company_id=eq.${staffUser.company_id}` },
        () => void loadDashboard()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [staffUser?.company_id, loadDashboard]);

  if (isLoading) {
    return <div className="p-4 text-sm text-slate-400">{t("setup.loadingDashboard")}</div>;
  }

  const totalNetProfit = profitability.reduce((sum, p) => sum + (p.net_profit ?? 0), 0);
  const atRiskCount = profitability.filter((p) => p.risk_status === "at_risk" || p.risk_status === "delayed").length;

  const statCards = [
    { label: t("setup.totalNetProfit"), value: totalNetProfit.toFixed(0), icon: TrendingUp, from: "from-emerald-500", to: "to-green-600", text: "text-emerald-600", ltr: true },
    { label: t("setup.liveOperations"), value: String(liveOps.length), icon: Activity, from: "from-indigo-500", to: "to-blue-600", text: "text-indigo-600", ltr: false },
    { label: t("setup.atRiskProjects"), value: String(atRiskCount), icon: AlertTriangle, from: "from-amber-500", to: "to-orange-600", text: "text-amber-600", ltr: false },
    { label: t("setup.lowStockCount"), value: String(lowStock.length), icon: PackageX, from: "from-red-500", to: "to-rose-600", text: "text-red-600", ltr: false },
  ];

  return (
    <div className="flex flex-col gap-6">
      {/* بطاقات ملخص سريعة */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.label} className="relative overflow-hidden rounded-2xl border border-slate-100 bg-white p-4 shadow-sm">
              <div className={`absolute -left-4 -top-4 h-20 w-20 rounded-full bg-gradient-to-br ${card.from} ${card.to} opacity-10`} />
              <div className="relative flex items-start justify-between">
                <div>
                  <div className="text-xs font-semibold text-slate-400">{card.label}</div>
                  <div className={`mt-1 text-2xl font-extrabold ${card.text}`} dir={card.ltr ? "ltr" : undefined}>
                    {card.value}
                  </div>
                </div>
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br ${card.from} ${card.to} text-white shadow-md`}>
                  <Icon size={18} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* المشاهدة الحية */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-bold text-slate-800">{t("setup.liveOpsTitle")}</h2>
        {liveOps.length === 0 ? (
          <p className="text-sm text-slate-400">{t("setup.noLiveOperations")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {liveOps.map((op) => (
              <li key={op.session_id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                <div className="flex items-center gap-2">
                  {/* نقطة نابضة: تؤكد بصرياً أن هذا نشاط إنتاجي حي الآن على آلة، وليس مجرد جلسة مفتوحة */}
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-500" />
                  </span>
                  <span className="font-semibold text-slate-700">{op.worker_name}</span>
                  <span className="text-slate-400">
                    {op.machine_name && `— ${op.machine_name}`} {op.project_name && `— ${op.project_name}`}
                    {op.piece_name && (
                      <span className="ms-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-600">{op.piece_name}</span>
                    )}
                  </span>
                </div>
                <span className="text-xs text-slate-400" dir="ltr">
                  {formatElapsed(op.elapsed_seconds ?? 0)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* تحليل صافي الربح ومؤشرات المخاطر */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-bold text-slate-800">{t("setup.profitabilityTable")}</h2>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b-2 border-slate-200 bg-slate-50/80 text-[11px] font-bold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2.5 text-start">{t("setup.projectName")}</th>
                <th className="px-3 py-2.5 text-start">{t("common.active")}</th>
                <th className="px-3 py-2.5 text-left">{t("setup.actualHours")}</th>
                <th className="px-3 py-2.5 text-left">{t("setup.timeVariance")}</th>
                <th className="px-3 py-2.5 text-left">{t("setup.netProfit")}</th>
              </tr>
            </thead>
            <tbody>
              {profitability.map((p) => {
                const risk = (p.risk_status && RISK_LABEL_KEYS[p.risk_status]) || DEFAULT_RISK;
                return (
                  <tr key={p.project_id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                    <td className="px-3 py-2.5 text-start font-semibold text-slate-700">{p.project_name}</td>
                    <td className="px-3 py-2.5 text-start">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${risk.className}`}>{t(risk.key)}</span>
                    </td>
                    <td className="px-3 py-2.5 text-left text-slate-500" dir="ltr">
                      {(p.actual_production_hours ?? 0).toFixed(1)} {t("setup.hoursShort")}
                    </td>
                    <td className="px-3 py-2.5 text-left text-slate-500" dir="ltr">
                      {p.time_variance_percent !== null ? `${p.time_variance_percent > 0 ? "+" : ""}${p.time_variance_percent}%` : "—"}
                    </td>
                    <td className={`px-3 py-2.5 text-left font-bold ${(p.net_profit ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`} dir="ltr">
                      {p.net_profit !== null ? p.net_profit.toFixed(0) : "—"}
                    </td>
                  </tr>
                );
              })}
              {profitability.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-slate-400">
                    {t("setup.noDataYet")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* تنبيهات المخزون */}
      {lowStock.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5">
          <h2 className="mb-3 text-lg font-bold text-red-700">{t("setup.reorderAlert")}</h2>
          <ul className="flex flex-col gap-1">
            {lowStock.map((item) => (
              <li key={item.id} className="text-sm text-red-600">
                {item.name}: {item.quantity_on_hand} {item.unit} {t("setup.minOnly")} ({t("setup.minThreshold")}: {item.reorder_threshold})
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}