import { useState } from "react";
import { useTranslation } from "react-i18next";
import { getLocalDeviceMode, resetLocalDeviceMode } from "../../../lib/deviceContext";

export function DeviceSettingsPage() {
  const { t } = useTranslation();
  const [isConfirming, setIsConfirming] = useState(false);
  const currentMode = getLocalDeviceMode();

  function handleReconfigure() {
    resetLocalDeviceMode();
    window.location.reload();
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="mb-2 text-lg font-bold text-slate-800">{t("nav.device")}</h2>
      <p className="mb-4 text-sm text-slate-500">
        {t("setup.deviceCurrentMode")}: <span className="font-semibold text-slate-700">{currentMode === "admin" ? t("setup.deviceAdmin") : t("setup.deviceKiosk")}</span>
      </p>

      <div className="rounded-lg bg-amber-50 p-4 text-sm text-amber-700">
        <p className="mb-3">
          {t("setup.reconfigureWarning")}
        </p>

        {!isConfirming ? (
          <button onClick={() => setIsConfirming(true)} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white">
            {t("setup.reconfigureDevice")}
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => setIsConfirming(false)} className="rounded-lg bg-white px-4 py-2 text-sm font-semibold text-slate-600">
              {t("common.cancel")}
            </button>
            <button onClick={handleReconfigure} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white">
              {t("setup.confirmReconfigure")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
