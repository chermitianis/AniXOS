import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Ban } from "lucide-react";
import type { WorkSession } from "../../../shared/types/database";
import { correctWorkSession, voidWorkSession } from "../api/kioskApi";

interface Props {
  session: WorkSession;
  /** العامل الحالي في الكشك — يُسجَّل كمنفّذ التصحيح في سجل التدقيق */
  workerId: string;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * نافذة تصحيح/إلغاء حدث. لا تحذف أي شيء فعلياً أبداً: كل تعديل يُسجَّل في
 * work_session_corrections (من قام به، متى، القيمة القديمة والجديدة، السبب)
 * والإلغاء (بدل الحذف) يُبقي السطر كاملاً مع علامة voided_at ويستبعده فقط
 * من التقارير النهائية — البند 12: الأحداث المصححة/الملغاة قابلة للتدقيق
 * دائماً ولا تختفي دون أثر.
 */
export function SessionCorrectionModal({ session, workerId, onClose, onSaved }: Props) {
  const { t } = useTranslation();
  const currentMinutes = Math.max(
    1,
    Math.round((session.duration_seconds ?? (Date.now() - new Date(session.started_at).getTime()) / 1000) / 60)
  );
  const [minutes, setMinutes] = useState(String(currentMinutes));
  const [reason, setReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const isReasonMissing = reason.trim().length === 0;

  async function save() {
    if (isReasonMissing) return;
    setIsSaving(true);
    await correctWorkSession(session, Math.max(0, Number(minutes) || 0) * 60, {
      reason: reason.trim(),
      correctedByType: "worker",
      correctedByWorkerId: workerId,
    });
    setIsSaving(false);
    onSaved();
    onClose();
  }

  async function markVoided() {
    if (isReasonMissing) return;
    setIsSaving(true);
    await voidWorkSession(session, {
      reason: reason.trim(),
      correctedByType: "worker",
      correctedByWorkerId: workerId,
    });
    setIsSaving(false);
    onSaved();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-800">{t("kiosk.correctSession")}</h2>
          <button type="button" onClick={onClose}>
            <X size={19} className="text-slate-400" />
          </button>
        </div>

        <p className="mb-3 text-sm text-slate-500">{t("kiosk.correctSessionBody")}</p>

        <label className="mb-3 block text-sm font-semibold text-slate-600">
          {t("kiosk.durationMinutes")}
          <input
            type="number"
            min="0"
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="mb-4 block text-sm font-semibold text-slate-600">
          {t("kiosk.correctionReason")}
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="mt-1 h-16 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder={t("kiosk.correctionReasonPlaceholder")}
          />
          {isReasonMissing && (
            <span className="mt-1 block text-xs font-semibold text-red-500">{t("kiosk.correctionReasonRequired")}</span>
          )}
        </label>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void markVoided()}
            disabled={isSaving || isReasonMissing}
            className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg bg-red-50 py-2 text-sm font-bold text-red-600 disabled:opacity-40"
          >
            <Ban size={15} />
            {t("kiosk.voidEvent")}
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={isSaving || isReasonMissing}
            className="flex-1 rounded-lg bg-indigo-600 py-2 text-sm font-bold text-white disabled:opacity-40"
          >
            {t("common.save")}
          </button>
        </div>
      </div>
    </div>
  );
}
