import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useOfflineSync } from "../hooks/useOfflineSync";

export function FooterBar() {
  const { t, i18n } = useTranslation();
  const { isOnline, pendingCount } = useOfflineSync();
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex h-10 items-center justify-between border-t border-slate-200 bg-white px-4 text-xs text-slate-500">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${isOnline ? "bg-green-500" : "bg-red-500"}`} />
        <span>{isOnline ? t("kiosk.online") : t("kiosk.offline")}</span>
        {pendingCount > 0 && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-700">
            {pendingCount} {t("kiosk.pendingSync")}
          </span>
        )}
      </div>

      <span>{t("kiosk.copyright", { year: now.getFullYear() })}</span>

      <span dir="ltr">{now.toLocaleString(i18n.language, { hour: "2-digit", minute: "2-digit", second: "2-digit" })}</span>
    </div>
  );
}
