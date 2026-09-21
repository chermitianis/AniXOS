import { useTranslation } from "react-i18next";
import {
  changeLanguage,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
} from "../../i18n/config";
import { Languages } from "lucide-react";

const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  fr: "Français",
  en: "English",
  ar: "العربية",
};

interface LanguageSwitcherProps {
  /**
   * - compact : petit select (barres, entêtes)
   * - full    : boutons côte à côte (écrans de connexion)
   * - card    : bloc encadré avec titre + description (page Mon Profil)
   */
  variant?: "compact" | "full" | "card";
}

export function LanguageSwitcher({ variant = "compact" }: LanguageSwitcherProps) {
  const { t, i18n } = useTranslation();
  const currentLanguage = i18n.language as SupportedLanguage;

  // ---------------------------------------------------------------------
  // Variante "full" — boutons côte à côte (écrans de connexion)
  // ---------------------------------------------------------------------
  if (variant === "full") {
    return (
      <div className="flex justify-center gap-2">
        {SUPPORTED_LANGUAGES.map((lang) => (
          <button
            key={lang}
            type="button"
            onClick={() => void changeLanguage(lang)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
              currentLanguage === lang
                ? "bg-blue-600 text-white"
                : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            {LANGUAGE_LABELS[lang]}
          </button>
        ))}
      </div>
    );
  }

  // ---------------------------------------------------------------------
  // Variante "card" — bloc pour la page Mon Profil
  // ---------------------------------------------------------------------
  if (variant === "card") {
    return (
      <div className="flex items-start gap-4 rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
          <Languages size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-slate-800">
            {t("setup.languageTitle")}
          </h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {t("setup.languageHint")}
          </p>
          <div className="mt-3">
            <select
              id="anixos-language-select"
              value={currentLanguage}
              onChange={(e) =>
                void changeLanguage(e.target.value as SupportedLanguage)
              }
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100"
              aria-label={t("setup.languageTitle")}
            >
              {SUPPORTED_LANGUAGES.map((lang) => (
                <option key={lang} value={lang}>
                  {LANGUAGE_LABELS[lang]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------
  // Variante "compact" (défaut) — petit select
  // ---------------------------------------------------------------------
  return (
    <select
      id="anixos-language-select"
      value={currentLanguage}
      onChange={(e) =>
        void changeLanguage(e.target.value as SupportedLanguage)
      }
      className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-600"
      aria-label={t("common.language")}
    >
      {SUPPORTED_LANGUAGES.map((lang) => (
        <option key={lang} value={lang}>
          {LANGUAGE_LABELS[lang]}
        </option>
      ))}
    </select>
  );
}