import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { TrendingUp, Activity, AlertTriangle, PackageX } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { createSafeChannel } from "../../../lib/realtimeChannel";
import { useStaffAuth } from "../../../auth/StaffAuthContext";
import type { ProjectProfitability, InventoryItem } from "../../../shared/types/database";

/** صف من v_live_operations (migration 0057) — نُعرّفه محلياً لأنه يعتمد الآن
 * على تسجيل الدخول (work_shifts) لا الجلسة النشطة فقط: session_id/session_type
 * يكونان null إن كان العامل متصلاً بلا مهمة جارية بعد */
interface LiveOperationRow {
  shift_id: string;
  worker_id: string;
  worker_name: string;
  shift_started_at: string;
  session_id: string | null;
  session_type: "production" | "downtime" | null;
  started_at: string | null;
  machine_id: string | null;
  machine_name: string | null;
  project_id: string | null;
  project_name: string | null;
  piece_task_id: string | null;
  piece_name: string | null;
  task_type_name: string | null;
  stop_reason_name: string | null;
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

/** ثوانٍ منقضية منذ تاريخ ISO، محسوبة لحظياً عند العرض (بلا الحاجة لعمود
 * محسوب في القاعدة، ولا لمؤقّت دوري — الصفحة تُحدَّث فورياً عبر Realtime
 * وكل 15 ثانية احتياطياً، وهو كافٍ لعرض "منذ متى" بدقة معقولة). */
function elapsedSecondsSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
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
      supabase.from("v_live_operations").select("*").order("shift_started_at", { ascending: false }),
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

  // بث حي: أي دخول/خروج عامل (work_shifts) أو بداية/نهاية/تبديل مهمة
  // (work_sessions) يُحدّث "المشاهدة الحية" فوراً — بلا انتظار الـ 15 ثانية.
  // الاشتراك بـwork_shifts ضروري الآن: عامل يسجّل دخوله بلا بدء أي مهمة بعد
  // كان سيبقى غائباً عن اللوحة حتى أول تحديث دوري لولا هذا الاشتراك
  useEffect(() => {
    if (!staffUser?.company_id) return;
    const channel = createSafeChannel(`live-ops-${staffUser.company_id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_sessions", filter: `company_id=eq.${staffUser.company_id}` },
        () => void loadDashboard()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "work_shifts", filter: `company_id=eq.${staffUser.company_id}` },
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
            {[...liveOps]
              .sort((a, b) => {
                const rank = (r: LiveOperationRow) => (r.session_type === "production" ? 0 : r.session_type === "downtime" ? 1 : 2);
                return rank(a) - rank(b) || new Date(b.shift_started_at).getTime() - new Date(a.shift_started_at).getTime();
              })
              .map((op) => {
                const isProduction = op.session_type === "production";
                const isDowntime = op.session_type === "downtime";
                const dotColor = isProduction ? "bg-blue-500" : isDowntime ? "bg-amber-500" : "bg-slate-300";
                const pingColor = isProduction ? "bg-blue-400" : isDowntime ? "bg-amber-400" : "";
                const currentEventLabel = isProduction
                  ? op.task_type_name ?? t("setup.inProduction")
                  : isDowntime
                    ? op.stop_reason_name ?? t("setup.inDowntime")
                    : t("setup.workerLoggedInWaiting");
                const elapsed = elapsedSecondsSince(op.started_at ?? op.shift_started_at);
                return (
                  <li key={op.shift_id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                    <div className="flex items-center gap-2">
                      {/* نقطة نابضة زرقاء = عملية إنتاج جارية، كهرمانية = في توقف، رمادية ثابتة = متصل فقط بانتظار بدء مهمة */}
                      <span className="relative flex h-2 w-2">
                        {pingColor && <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${pingColor} opacity-75`} />}
                        <span className={`relative inline-flex h-2 w-2 rounded-full ${dotColor}`} />
                      </span>
                      <span className="font-semibold text-slate-700">{op.worker_name}</span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                          isProduction
                            ? "bg-blue-50 text-blue-600"
                            : isDowntime
                              ? "bg-amber-50 text-amber-700"
                              : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {currentEventLabel}
                      </span>
                      <span className="text-slate-400">
                        {op.machine_name && `— ${op.machine_name}`} {op.project_name && `— ${op.project_name}`}
                        {op.piece_name && (
                          <span className="ms-1 rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-600">{op.piece_name}</span>
                        )}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400" dir="ltr">
                      {formatElapsed(elapsed)}
                    </span>
                  </li>
                );
              })}
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