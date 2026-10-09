import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Moon, Sun, Settings, Globe, Monitor } from "lucide-react";
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

/**
 * TopRightActions — مجموعة الأزرار في يمين TopBar.
 * الآن مدمج (ليس fixed floating) — يأخذ مساحته داخل TopBar.
 * التباين مضمون في الوضعين.
 */
export function TopRightActions({ onOpenProfile }: TopRightActionsProps) {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme, mode } = useTheme();
  const [isOnline, setIsOnline] = useState(() => connectivityMonitor.getStatus());
  const [showSettings, setShowSettings] = useState(false);
  const [showLangMenu, setShowLangMenu] = useState(false);

  useEffect(() => connectivityMonitor.subscribe(setIsOnline), []);

  const currentLang = (i18n.language || "fr") as SupportedLanguage;

  return (
    <>
      <div className="flex items-center gap-1">
        {/* Online/Offline indicator */}
        <div
          className="relative flex h-8 w-8 items-center justify-center"
          title={isOnline ? t("kiosk.online") : t("kiosk.offline")}
        >
          <span
            className={`h-2.5 w-2.5 rounded-full ${
              isOnline ? "bg-emerald-500" : "bg-red-500"
            }`}
          />
          {isOnline && (
            <span className="absolute inline-flex h-2.5 w-2.5 animate-ping rounded-full bg-emerald-400 opacity-60" />
          )}
        </div>

        {/* Language */}
        <div className="relative">
          <button
            onClick={() => setShowLangMenu((v) => !v)}
            title={t("common.language")}
            className="flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-bold transition-colors"
            style={{
              color: "var(--topbar-text-secondary)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = "var(--bg-muted)";
              e.currentTarget.style.color = "var(--topbar-text)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = "transparent";
              e.currentTarget.style.color = "var(--topbar-text-secondary)";
            }}
          >
            <Globe size={14} />
            {LANG_LABELS[currentLang]}
          </button>
          {showLangMenu && (
            <div
              className="absolute end-0 top-full z-50 mt-2 w-32 overflow-hidden rounded-lg border shadow-lg"
              style={{
                backgroundColor: "var(--bg-card)",
                borderColor: "var(--border-subtle)",
              }}
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <button
                  key={lang}
                  onClick={() => {
                    void changeLanguage(lang);
                    setShowLangMenu(false);
                  }}
                  className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold transition-colors"
                  style={{
                    color:
                      currentLang === lang
                        ? "var(--brand-orange)"
                        : "var(--text-primary)",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = "var(--bg-muted)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = "transparent";
                  }}
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

        {/* Theme toggle */}
        <button
          onClick={toggleTheme}
          title={mode === "system" ? "Système" : theme === "dark" ? t("generalSettings.light") : t("generalSettings.dark")}
          className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
          style={{ color: "var(--topbar-text-secondary)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--bg-muted)";
            e.currentTarget.style.color = "var(--topbar-text)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = "var(--topbar-text-secondary)";
          }}
        >
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        {/* Settings */}
        <button
          onClick={() => setShowSettings(true)}
          title={t("generalSettings.title")}
          className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors"
          style={{ color: "var(--topbar-text-secondary)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--bg-muted)";
            e.currentTarget.style.color = "var(--topbar-text)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
            e.currentTarget.style.color = "var(--topbar-text-secondary)";
          }}
        >
          <Settings size={15} />
        </button>

        {/* Profile */}
        <ProfileMenu onOpenProfile={onOpenProfile} />
      </div>

      {showSettings && <GeneralSettingsModal onClose={() => setShowSettings(false)} />}
    </>
  );
}