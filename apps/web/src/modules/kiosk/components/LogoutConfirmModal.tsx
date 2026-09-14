import { useTranslation } from "react-i18next";
import { AlertTriangle, X } from "lucide-react";

interface Props {
  onCancel: () => void;
  onConfirm: () => void;
}

/**
 * تُعرَض فقط عندما يملك العامل حدثاً نشطاً (مهمة أو توقف) مرتبطاً بقطعة عند
 * محاولة تسجيل الخروج. لا يُسمح بالخروج الصامت دون تنبيه — إما يعود العامل
 * لإيقاف/تحديد حالة القطعة (Terminer/À continuer)، أو يؤكد الخروج فتُغلق
 * الأحداث المفتوحة تلقائياً ضمن إنهاء الحصة (البند 8).
 */
export function LogoutConfirmModal({ onCancel, onConfirm }: Props) {
  const { t } = useTranslation();

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/60 p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-amber-600">
            <AlertTriangle size={20} />
            <h2 className="text-lg font-bold text-slate-800">{t("kiosk.logoutConfirmTitle")}</h2>
          </div>
          <button type="button" onClick={onCancel}>
            <X size={19} className="text-slate-400" />
          </button>
        </div>

        <p className="mb-5 text-sm text-slate-600">{t("kiosk.logoutConfirmBody")}</p>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-lg bg-slate-100 py-2 text-sm font-bold text-slate-600"
          >
            {t("kiosk.logoutConfirmStay")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-bold text-white"
          >
            {t("kiosk.logoutConfirmProceed")}
          </button>
        </div>
      </div>
    </div>
  );
}
