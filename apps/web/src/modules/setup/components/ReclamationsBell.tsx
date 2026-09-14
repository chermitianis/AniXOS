import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Bell, CheckCircle2, Wrench, X } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { createSafeChannel } from "../../../lib/realtimeChannel";
import { useStaffAuth } from "../../../auth/StaffAuthContext";

/** صف réclamation مع أسماء العامل/الآلة المرفقة عبر join — تُعرض في الجرس */
interface ReclamationRow {
  id: string;
  worker_id: string;
  worker_name: string;
  machine_id: string | null;
  machine_name: string | null;
  message: string;
  status: "nouveau" | "en_cours" | "resolu";
  read_at: string | null;
  created_at: string;
}

const STATUS_STYLES: Record<ReclamationRow["status"], string> = {
  nouveau: "bg-red-100 text-red-700",
  en_cours: "bg-amber-100 text-amber-700",
  resolu: "bg-green-100 text-green-700",
};

function timeAgo(iso: string, locale: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "•";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  return new Date(iso).toLocaleDateString(locale, { day: "2-digit", month: "2-digit" });
}

/**
 * جرس التنبيهات: أفضل موضع عملي لرسائل réclamation القادمة من العمال —
 * مرئي من أي شاشة إدارية. العدّاد الأحمر = عدد الرسائل غير المقروءة
 * (read_at is null). القائمة تُعرض عبر Portal بموضع "fixed" محسوب من موقع
 * الجرس فعلياً على الشاشة، فلا تُقطع أبداً مهما كان عرض/تمرير الحاوية الأم.
 * فتح رسالة يعرضها في نافذة عائمة كاملة فوق الواجهة (مع زر إغلاق أعلاها)
 * ويُعلّمها فوراً كمقروءة، فتختفي من القائمة والعدّاد.
 */
export function ReclamationsBell() {
  const { t, i18n } = useTranslation();
  const { staffUser } = useStaffAuth();
  const [items, setItems] = useState<ReclamationRow[]>([]);
  const [isListOpen, setIsListOpen] = useState(false);
  const [listPosition, setListPosition] = useState<{ top: number; end: number } | null>(null);
  const [openItem, setOpenItem] = useState<ReclamationRow | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from("workshop_reclamations")
      .select("id, worker_id, machine_id, message, status, read_at, created_at, workers(full_name), machines(name)")
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(30);

    const rows = ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: row.id as string,
      worker_id: row.worker_id as string,
      worker_name: (row.workers as { full_name?: string } | null)?.full_name ?? "—",
      machine_id: row.machine_id as string | null,
      machine_name: (row.machines as { name?: string } | null)?.name ?? null,
      message: row.message as string,
      status: row.status as ReclamationRow["status"],
      read_at: row.read_at as string | null,
      created_at: row.created_at as string,
    }));
    setItems(rows);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // بث حي: أي réclamation جديدة تنعكس فوراً على الجرس، أينما كان المدير في التطبيق
  useEffect(() => {
    if (!staffUser?.company_id) return;
    const channel = createSafeChannel(`reclamations-bell-${staffUser.company_id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "workshop_reclamations", filter: `company_id=eq.${staffUser.company_id}` },
        () => void load()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [staffUser?.company_id, load]);

  // إغلاق القائمة عند النقر خارجها (خارج الزر وخارج اللوحة المعروضة عبر Portal)
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setIsListOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function toggleList() {
    if (!isListOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const isRtl = document.documentElement.dir === "rtl";
      // "end" منطقي: نبعّد اللوحة عن حافة الشاشة المقابلة لاتجاه الكتابة، بغض النظر عن اللغة الحالية
      const endOffset = isRtl ? rect.left : window.innerWidth - rect.right;
      setListPosition({ top: rect.bottom + 8, end: Math.max(8, endOffset - 160) });
    }
    setIsListOpen((v) => !v);
  }

  async function openMessage(item: ReclamationRow) {
    setOpenItem(item);
    setIsListOpen(false);
    if (!item.read_at) {
      await supabase.from("workshop_reclamations").update({ read_at: new Date().toISOString() }).eq("id", item.id);
      void load();
    }
  }

  async function updateStatus(id: string, status: ReclamationRow["status"]) {
    setUpdatingId(id);
    const patch: Record<string, unknown> = { status };
    if (status === "resolu") {
      patch.resolved_at = new Date().toISOString();
      patch.resolved_by_staff_id = staffUser?.id ?? null;
    }
    await supabase.from("workshop_reclamations").update(patch).eq("id", id);
    setOpenItem((prev) => (prev && prev.id === id ? { ...prev, status } : prev));
    setUpdatingId(null);
  }

  const unreadCount = items.length;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleList}
        title={t("setup.reclamationsBellTitle")}
        className="relative rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {/* القائمة المنسدلة — تُعرض عبر Portal بموضع fixed محسوب من الشاشة، لا يمكن أن تُقطع */}
      {isListOpen &&
        listPosition &&
        createPortal(
          <div
            ref={panelRef}
            style={{ position: "fixed", top: listPosition.top, insetInlineEnd: listPosition.end }}
            className="z-[70] w-80 max-w-[calc(100vw-1rem)] rounded-xl border border-slate-200 bg-white shadow-2xl"
          >
            <div className="border-b border-slate-100 px-4 py-3">
              <h3 className="text-sm font-bold text-slate-700">{t("setup.reclamationsBellTitle")}</h3>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {items.length === 0 ? (
                <p className="px-4 py-6 text-center text-sm text-slate-400">{t("setup.reclamationsEmpty")}</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {items.map((r) => (
                    <li key={r.id}>
                      <button
                        onClick={() => void openMessage(r)}
                        className="flex w-full flex-col items-start gap-1 px-4 py-3 text-start transition-colors hover:bg-slate-50"
                      >
                        <div className="flex w-full items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-700">{r.worker_name}</span>
                          <span className="shrink-0 text-[11px] text-slate-400" dir="ltr">{timeAgo(r.created_at, i18n.language)}</span>
                        </div>
                        <p className="line-clamp-1 text-xs text-slate-500">{r.message}</p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>,
          document.body
        )}

      {/* نافذة عائمة كاملة لعرض الرسالة المفتوحة — فوق كامل الواجهة، بزر إغلاق أعلاها */}
      {openItem &&
        createPortal(
          <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/50 p-4" onClick={() => setOpenItem(null)}>
            <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md rounded-2xl bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <h3 className="text-base font-bold text-slate-800">{t("setup.reclamationsBellTitle")}</h3>
                <button
                  onClick={() => setOpenItem(null)}
                  className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                  aria-label={t("common.close")}
                >
                  <X size={18} />
                </button>
              </div>

              <div className="px-5 py-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-bold text-slate-700">{openItem.worker_name}</span>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[openItem.status]}`}>
                    {t(
                      openItem.status === "nouveau"
                        ? "setup.reclamationStatusNew"
                        : openItem.status === "en_cours"
                          ? "setup.reclamationStatusInProgress"
                          : "setup.reclamationStatusResolved"
                    )}
                  </span>
                </div>
                {openItem.machine_name && (
                  <div className="mb-2 flex items-center gap-1.5 text-xs text-slate-400">
                    <Wrench size={12} /> {openItem.machine_name}
                  </div>
                )}
                <p className="mb-1 whitespace-pre-wrap text-sm leading-relaxed text-slate-600">{openItem.message}</p>
                <span className="text-[11px] text-slate-400" dir="ltr">
                  {new Date(openItem.created_at).toLocaleString(i18n.language, { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>

              {openItem.status !== "resolu" && (
                <div className="flex gap-2 border-t border-slate-100 px-5 py-4">
                  {openItem.status === "nouveau" && (
                    <button
                      disabled={updatingId === openItem.id}
                      onClick={() => void updateStatus(openItem.id, "en_cours")}
                      className="flex-1 rounded-lg bg-amber-50 py-2 text-sm font-semibold text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-40"
                    >
                      {t("setup.markInProgress")}
                    </button>
                  )}
                  <button
                    disabled={updatingId === openItem.id}
                    onClick={() => void updateStatus(openItem.id, "resolu")}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-50 py-2 text-sm font-semibold text-green-700 transition-colors hover:bg-green-100 disabled:opacity-40"
                  >
                    <CheckCircle2 size={14} /> {t("setup.markResolved")}
                  </button>
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
