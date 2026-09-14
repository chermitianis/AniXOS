import { useEffect, useState } from "react";
import { Bell, Check, Send, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { PieceHandoff } from "../../../shared/types/database";
import { supabase } from "../../../lib/supabaseClient";
import { createSafeChannel } from "../../../lib/realtimeChannel";
import {
  createPieceHandoff,
  fetchPieceHandoffs,
  markPieceHandoffRead,
} from "../api/kioskApi";

interface Props {
  pieceTaskId: string;
  /** يُربط برسالة Passation صراحة — وليس ربطاً ضمنياً عبر القطعة فقط */
  projectId: string | null;
  /** حصة العامل الحالية عند الإرسال */
  shiftId: string | null;
  workerId: string;
  onClose: () => void;
}

export function PassationPanel({ pieceTaskId, projectId, shiftId, workerId, onClose }: Props) {
  const { t, i18n } = useTranslation();
  const [message, setMessage] = useState("");
  const [handoffs, setHandoffs] = useState<PieceHandoff[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const unread = handoffs.filter(
    (handoff) => !handoff.is_read && handoff.from_worker_id !== workerId
  );

  async function reload() {
    try {
      const data = await fetchPieceHandoffs(pieceTaskId);
      setHandoffs(data);
    } catch {
      // Handle optional fetch error logging if needed
    }
  }

  useEffect(() => {
    void reload();
  }, [pieceTaskId]);

  // بث حي: أي رسالة Passation جديدة على هذه القطعة تحديداً (من عامل آخر أو
  // من الإدارة) تظهر فوراً دون إعادة تحميل يدوية — البند 10 و11
  useEffect(() => {
    const channel = createSafeChannel(`piece-handoffs-${pieceTaskId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "piece_handoffs", filter: `piece_task_id=eq.${pieceTaskId}` },
        () => void reload()
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [pieceTaskId]);

  async function send() {
    if (!message.trim()) return;
    setIsSending(true);
    setError(null);
    try {
      await createPieceHandoff(pieceTaskId, projectId, shiftId, workerId, message);
      setMessage("");
      await reload();
    } catch {
      setError(t("kiosk.passationError"));
    } finally {
      setIsSending(false);
    }
  }

  async function read(handoff: PieceHandoff) {
    if (!handoff.is_read) {
      await markPieceHandoffRead(handoff);
      setHandoffs((items) =>
        items.map((item) =>
          item.id === handoff.id
            ? { ...item, is_read: true, read_at: new Date().toISOString() }
            : item
        )
      );
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between bg-gradient-to-r from-amber-500 to-orange-500 px-5 py-4 text-white">
          <div className="flex items-center gap-2">
            <Bell size={20} />
            <h2 className="text-lg font-extrabold">{t("kiosk.passation")}</h2>
            {unread.length > 0 && (
              <span className="rounded-full bg-white px-2 py-0.5 text-xs font-bold text-orange-600">
                {unread.length}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 hover:bg-white/15"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div className="max-h-[70vh] overflow-auto p-5">
          {/* Write Handoff Message Form */}
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <label className="mb-2 block text-sm font-bold text-amber-800">
              {t("kiosk.passationWrite")}
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-amber-200 bg-white p-3 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder={t("kiosk.passationPlaceholder")}
            />
            <div className="mt-2 flex items-center justify-between">
              {error && <span className="text-xs text-red-600">{error}</span>}
              <button
                type="button"
                onClick={() => void send()}
                disabled={isSending || !message.trim()}
                className="ms-auto inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-bold text-white transition-opacity disabled:opacity-50"
              >
                <Send size={15} />
                {isSending ? t("common.saving") : t("kiosk.passationSend")}
              </button>
            </div>
          </div>

          {/* Handoff History */}
          <h3 className="mb-2 text-sm font-bold text-slate-700">
            {t("kiosk.passationHistory")}
          </h3>

          {handoffs.length === 0 ? (
            <p className="text-sm text-slate-400">{t("kiosk.passationEmpty")}</p>
          ) : (
            <div className="space-y-2">
              {handoffs.map((handoff) => (
                <button
                  type="button"
                  key={handoff.id}
                  onClick={() => void read(handoff)}
                  className={`w-full rounded-xl border p-3 text-start transition-colors ${
                    handoff.is_read
                      ? "border-slate-100 bg-slate-50"
                      : "border-amber-300 bg-amber-50 shadow-sm"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-500">
                      {new Date(handoff.created_at).toLocaleString(i18n.language)}
                    </span>
                    {handoff.is_read ? (
                      <Check size={15} className="text-green-600" />
                    ) : (
                      <span className="text-xs font-extrabold text-orange-600">
                        {t("kiosk.passationUnread")}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-slate-700">{handoff.message}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
