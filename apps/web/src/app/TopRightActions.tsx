import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Moon, Sun, Settings, Globe } from "lucide-react";
import { changeLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from "../i18n/config";
import { connectivityMonitor } from "../lib/connectivity";
import { useTheme } from "./ThemeContext";
import { GeneralSettingsModal } from "./GeneralSettingsModal";
import { ProfileMenu } from "./ProfileMenu";

interface TopRightActionsProps {
  onOpenProfile: () => void;
}

const LANG_LABELS: Record<SupportedLanguage, string> = {
  fr: "FR",
  en: "EN",
  ar: "AR",
};

export function TopRightActions({ onOpenProfile }: TopRightActionsProps) {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const [isOnline, setIsOnline] = useState(() => connectivityMonitor.getStatus());
  const [showSettings, setShowSettings] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);

  useEffect(() => connectivityMonitor.subscribe(setIsOnline), []);

  const currentLang = (i18n.language || "fr") as SupportedLanguage;

  return (
    <>
      <div className="fixed end-3 top-3 z-40 flex items-center gap-1 rounded-full border border-slate-200 bg-white/90 p-1 shadow-md backdrop-blur">
        {/* Indicateur online/offline */}
        <div
          className="relative flex h-8 w-8 items-center justify-center"
          title={isOnline ? t("kiosk.online") : t("kiosk.offline")}
        >
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              isOnline ? "bg-green-500" : "bg-red-500"
            }`}
          />
          {isOnline && (
            <span className="absolute inline-flex h-2.5 w-2.5 animate-ping rounded-full bg-green-400 opacity-60" />
          )}
        </div>

        {/* Langue */}
        <div className="relative">
          <button
            onClick={() => setShowLangMenu((v) => !v)}
            title={t("common.language")}
            className="flex h-8 items-center gap-1 rounded-full px-2 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-100"
          >
            <Globe size={14} className="text-slate-500" />
            {LANG_LABELS[currentLang]}
          </button>
          {showLangMenu && (
            <div className="absolute end-0 top-full mt-2 w-32 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg">
              {SUPPORTED_LANGUAGES.map((lang) => (
                <button
                  key={lang}
                  onClick={() => {
                    void changeLanguage(lang);
                    setShowLangMenu(false);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-xs font-semibold hover:bg-slate-50 ${
                    currentLang === lang ? "text-indigo-600" : "text-slate-600"
                  }`}
                >
                  <span>
                    {lang === "fr" ? "Français" : lang === "en" ? "English" : "العربية"}
                  </span>
                  {currentLang === lang && <span>✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Thème */}
        <button
          onClick={toggleTheme}
          title={theme === "dark" ? t("generalSettings.light") : t("generalSettings.dark")}
          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
        >
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        {/* Paramètres */}
        <button
          onClick={() => setShowSettings(true)}
          title={t("generalSettings.title")}
          className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
        >
          <Settings size={15} />
        </button>

        {/* Profil */}
        <ProfileMenu onOpenProfile={onOpenProfile} />
      </div>

      {showSettings && <GeneralSettingsModal onClose={() => setShowSettings(false)} />}
    </>
  );
}