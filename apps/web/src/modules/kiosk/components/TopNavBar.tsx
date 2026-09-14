import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Maximize2, Minimize2, MoonStar, Printer, Settings, LogOut, Timer, CalendarDays, MessageCircleWarning } from "lucide-react";
import { useSessionTimer } from "../hooks/useSessionTimer";
import { LanguageSwitcher } from "../../../shared/components/LanguageSwitcher";
import { AppLogo } from "../../../shared/components/AppLogo";
import { ManagerDeviceResetModal } from "./ManagerDeviceResetModal";
import { PlanningOverviewModal } from "./PlanningOverviewModal";
import { ReclamationModal } from "./ReclamationModal";

interface TopNavBarProps {
  sessionStartedAt: string;
  workerId: string;
  onLogout: () => void;
  isLoggingOut?: boolean;
}

export function TopNavBar({ sessionStartedAt, workerId, onLogout, isLoggingOut }: TopNavBarProps) {
  const { t } = useTranslation();
  const elapsed = useSessionTimer(sessionStartedAt);
  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const [isPlanningOpen, setIsPlanningOpen] = useState(false);
  const [isReclamationOpen, setIsReclamationOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isDark, setIsDark] = useState(() => localStorage.getItem("anixos-theme") === "dark");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
    localStorage.setItem("anixos-theme", isDark ? "dark" : "light");
  }, [isDark]);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      void document.exitFullscreen();
      setIsFullscreen(false);
    }
  }

  function toggleDarkMode() {
    setIsDark((value) => !value);
  }

  const iconButtonClass = "rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800";

  return (
    <div className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4">
      <div className="flex items-center gap-2.5">
        <AppLogo size="sm" />
        <span className="text-lg font-extrabold tracking-tight text-slate-800">AniXOS</span>
        <span className="hidden text-sm font-medium text-slate-400 sm:inline">| {t("kiosk.appLabel")}</span>
      </div>

      <div className="flex items-center gap-2 rounded-full bg-green-50 px-4 py-1.5">
        <Timer size={16} className="text-green-600" />
        <span className="font-mono text-lg font-bold text-green-700" dir="ltr">
          {elapsed}
        </span>
      </div>

      <div className="flex items-center gap-0.5">
        <LanguageSwitcher />
        <button title={t("kiosk.planningOverviewTitle")} onClick={() => setIsPlanningOpen(true)} className={iconButtonClass}>
          <CalendarDays size={18} />
        </button>
        <button title={t("kiosk.reclamationTitle")} onClick={() => setIsReclamationOpen(true)} className={iconButtonClass}>
          <MessageCircleWarning size={18} />
        </button>
        <button title={t("kiosk.fullscreen")} onClick={toggleFullscreen} className={iconButtonClass}>
          {isFullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
        </button>
        <button title={t("kiosk.darkMode")} onClick={toggleDarkMode} className={iconButtonClass}>
          <MoonStar size={18} />
        </button>
        <button title={t("common.print")} onClick={() => window.print()} className={iconButtonClass}>
          <Printer size={18} />
        </button>
        <button title={t("kiosk.deviceSettings")} onClick={() => setIsResetModalOpen(true)} className={iconButtonClass}>
          <Settings size={18} />
        </button>
        <button title={t("common.logout")} onClick={onLogout} disabled={isLoggingOut} className="rounded-lg p-2 text-red-500 transition-colors hover:bg-red-50 disabled:opacity-40">
          <LogOut size={18} />
        </button>
      </div>

      {isResetModalOpen && <ManagerDeviceResetModal onClose={() => setIsResetModalOpen(false)} />}
      {isPlanningOpen && <PlanningOverviewModal onClose={() => setIsPlanningOpen(false)} />}
      {isReclamationOpen && <ReclamationModal workerId={workerId} onClose={() => setIsReclamationOpen(false)} />}
    </div>
  );
}
