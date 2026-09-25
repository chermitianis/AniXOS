import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Moon, Sun, Bell, Languages } from "lucide-react";
import { useTheme } from "./ThemeContext";
import { changeLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from "../i18n/config";

interface GeneralSettingsModalProps {
  onClose: () => void;
}

const LANG_LABELS: Record<SupportedLanguage, string> = {
  fr: "Français",
  en: "English",
  ar: "العربية",
};

export function GeneralSettingsModal({ onClose }: GeneralSettingsModalProps) {
  const { t, i18n } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [notificationsEnabled, setNotificationsEnabled] = useState(
    () => localStorage.getItem("anixos-notifications") !== "off",
  );

  function handleToggleNotifications() {
    const next = !notificationsEnabled;
    setNotificationsEnabled(next);
    localStorage.setItem("anixos-notifications", next ? "on" : "off");
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">
            {t("generalSettings.title")}
          </h2>
          <button
            onClick={onClose}
            className="rounded p-1 text-slate-400 hover:bg-slate-100"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          {/* Langue */}
          <SettingRow
            icon={Languages}
            label={t("generalSettings.language")}
            hint={t("generalSettings.languageHint")}
          >
            <select
              value={i18n.language}
              onChange={(e) => void changeLanguage(e.target.value as SupportedLanguage)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm"
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {LANG_LABELS[lang]}
                </option>
              ))}
            </select>
          </SettingRow>

          {/* Thème */}
          <SettingRow
            icon={theme === "dark" ? Moon : Sun}
            label={t("generalSettings.theme")}
            hint={t("generalSettings.themeHint")}
          >
            <div className="flex gap-1 rounded-lg border border-slate-200 p-0.5">
              <button
                onClick={() => setTheme("light")}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                  theme === "light"
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <Sun size={12} />
                {t("generalSettings.light")}
              </button>
              <button
                onClick={() => setTheme("dark")}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
                  theme === "dark"
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <Moon size={12} />
                {t("generalSettings.dark")}
              </button>
            </div>
          </SettingRow>

          {/* Notifications */}
          <SettingRow
            icon={Bell}
            label={t("generalSettings.notifications")}
            hint={t("generalSettings.notificationsHint")}
          >
            <button
              type="button"
              onClick={handleToggleNotifications}
              role="switch"
              aria-checked={notificationsEnabled}
              className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                notificationsEnabled ? "bg-indigo-500" : "bg-slate-300"
              }`}
            >
              <span
                className="pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform"
                style={{
                  transform: notificationsEnabled ? "translateX(22px)" : "translateX(2px)",
                }}
              />
            </button>
          </SettingRow>
        </div>
      </div>
    </div>
  );
}

function SettingRow({
  icon: Icon,
  label,
  hint,
  children,
}: {
  icon: typeof Moon;
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-100 bg-slate-50/50 p-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-slate-500 shadow-sm">
        <Icon size={16} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold text-slate-700">{label}</div>
        <div className="mt-0.5 text-[11px] text-slate-400">{hint}</div>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}