import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Monitor, Factory, CheckCircle2 } from "lucide-react";
import { registerCurrentDevice } from "../../../lib/deviceContext";
import { useStaffAuth } from "../../../auth/StaffAuthContext";

interface DeviceRoleSelectionPageProps {
  onRegistered: () => void;
}

export function DeviceRoleSelectionPage({ onRegistered }: DeviceRoleSelectionPageProps) {
  const { t } = useTranslation();
  const { staffUser } = useStaffAuth();
  const [deviceName, setDeviceName] = useState("");
  const [selectedMode, setSelectedMode] = useState<"admin" | "kiosk" | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    if (!selectedMode || !deviceName.trim()) return;
    setIsSubmitting(true);
    setError(null);

    const result = await registerCurrentDevice(deviceName.trim(), selectedMode);

    if (!result.success) {
      setError(result.message ?? "Erreur");
      setIsSubmitting(false);
      return;
    }

    onRegistered();
    // إعادة تحميل كاملة إجبارية: القرار بين واجهة الكشك والواجهة الإدارية
    // يُتَّخذ في AppRouter (المكوّن الأب)، وهو لا يُعاد تقييمه تلقائياً عند
    // تغيّر الحالة داخل مكوّن ابن مثل هذه الصفحة. إعادة التحميل تضمن قراءة
    // device_mode المُحدَّث للتو من localStorage من الصفر، وهذا مقبول تماماً
    // لأن هذا إجراء لمرة واحدة فقط في حياة الجهاز (وليس تدفقاً متكرراً).
    window.location.reload();
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 p-4">
      <div className="pointer-events-none absolute -top-32 -left-32 h-96 w-96 rounded-full bg-indigo-600/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-blue-500/20 blur-3xl" />

      <div className="relative w-full max-w-lg rounded-2xl border border-white/10 bg-white p-8 shadow-2xl">
        <h1 className="mb-1 text-xl font-extrabold tracking-tight text-slate-800">{t("setup.deviceRoleTitle")}</h1>
        <p className="mb-6 text-sm text-slate-400">
          {t("setup.deviceRoleSubtitle")}
        </p>

        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            onClick={() => setSelectedMode("admin")}
            className={`relative rounded-xl border-2 p-4 text-right transition-all ${
              selectedMode === "admin" ? "border-indigo-500 bg-indigo-50 shadow-md" : "border-slate-200 hover:border-slate-300"
            }`}
          >
            {selectedMode === "admin" && <CheckCircle2 className="absolute left-3 top-3 text-indigo-600" size={18} />}
            <Monitor className="mb-2 text-indigo-600" size={24} />
            <div className="mb-1 text-lg font-bold text-slate-800">{t("setup.deviceAdmin")}</div>
            <div className="text-sm text-slate-500">{t("setup.deviceAdminDesc")}</div>
          </button>

          <button
            onClick={() => setSelectedMode("kiosk")}
            className={`relative rounded-xl border-2 p-4 text-right transition-all ${
              selectedMode === "kiosk" ? "border-orange-500 bg-orange-50 shadow-md" : "border-slate-200 hover:border-slate-300"
            }`}
          >
            {selectedMode === "kiosk" && <CheckCircle2 className="absolute left-3 top-3 text-orange-600" size={18} />}
            <Factory className="mb-2 text-orange-600" size={24} />
            <div className="mb-1 text-lg font-bold text-slate-800">{t("setup.deviceKiosk")}</div>
            <div className="text-sm text-slate-500">{t("setup.deviceKioskDesc")}</div>
          </button>
        </div>

        {selectedMode === "kiosk" && !staffUser?.is_owner && (
          <div className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
            {t("setup.kioskDeviceOwnerOnly")}
          </div>
        )}

        {selectedMode && (
          <>
            <label className="mb-1 block text-sm font-semibold text-slate-600">{t("setup.deviceNameLabel")}</label>
            <input
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder={selectedMode === "kiosk" ? t("setup.kioskNamePlaceholder") : t("setup.adminNamePlaceholder")}
              className="mb-4 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-50"
            />
          </>
        )}

        {error && <div className="mb-4 rounded-xl bg-red-50 px-4 py-2.5 text-sm font-medium text-red-600">{error}</div>}

        <button
          onClick={handleConfirm}
          disabled={!selectedMode || !deviceName.trim() || isSubmitting}
          className="w-full rounded-xl bg-gradient-to-br from-indigo-600 to-blue-600 py-3 font-bold text-white shadow-lg shadow-indigo-200 transition-transform active:scale-[0.98] disabled:opacity-40"
        >
          {isSubmitting ? t("setup.saving") : t("setup.confirmButton")}
        </button>
      </div>
    </div>
  );
}
