import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../../../lib/supabaseClient";
import { verifyManagerCredentials } from "../../../lib/ephemeralAuthClient";
import { resetLocalDeviceMode } from "../../../lib/deviceContext";

interface ManagerDeviceResetModalProps {
  onClose: () => void;
}

/**
 * يسمح بتحويل جهاز Kiosk رجوعاً إلى جهاز إداري. نظراً لأن جلسة الكشك تخص
 * "الجهاز" وليس أي موظف، لا يمكن ببساطة "تبديل الدور محلياً" كما في الجهاز
 * الإداري — بل يجب: التحقق من هوية مدير حقيقي (بلا المساس بجلسة الجهاز
 * الدائمة)، ثم إنهاء جلسة الجهاز فعلياً وإعادة الجهاز لحالة "أول تشغيل"،
 * بحيث يُسجِّل ذلك المدير دخوله بحسابه الشخصي مباشرة بعد إعادة التحميل.
 */
export function ManagerDeviceResetModal({ onClose }: ManagerDeviceResetModalProps) {
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIsVerifying(true);

    try {
      const result = await verifyManagerCredentials(email, password);
      if (!result.success) {
        setError(result.message ?? t("kiosk.deviceResetFailed"));
        return;
      }

      // التحقق نجح: الآن ننهي جلسة الجهاز الدائمة الحقيقية فعلياً، ونمسح
      // دور الجهاز محلياً — هذا يُعيد الجهاز لحالة "أول تشغيل" تماماً
      await supabase.auth.signOut();
      resetLocalDeviceMode();
      window.location.reload();
    } finally {
      setIsVerifying(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
        <h2 className="mb-1 text-lg font-bold text-slate-800">{t("kiosk.deviceResetTitle")}</h2>
        <p className="mb-4 text-sm text-slate-400">{t("kiosk.deviceResetBody")}</p>

        <label className="mb-1 block text-sm font-semibold text-slate-600">{t("auth.email")}</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          dir="ltr"
          autoFocus
          required
        />

        <label className="mb-1 block text-sm font-semibold text-slate-600">{t("auth.password")}</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-3 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          required
        />

        {error && <div className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>}

        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 rounded-lg py-2 text-sm text-slate-500">
            {t("common.cancel")}
          </button>
          <button
            type="submit"
            disabled={isVerifying}
            className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-bold text-white disabled:opacity-50"
          >
            {isVerifying ? t("common.loading") : t("common.confirm")}
          </button>
        </div>
      </form>
    </div>
  );
}
