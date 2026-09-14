import { useTranslation } from "react-i18next";
import { changeLanguage, SUPPORTED_LANGUAGES, type SupportedLanguage } from "../../i18n/config";

const LANGUAGE_LABELS: Record<SupportedLanguage, string> = {
  fr: "Français",
  en: "English",
  ar: "العربية",
};

interface LanguageSwitcherProps {
  /** compact: قائمة منسدلة صغيرة (مناسبة للشريط العلوي)؛ full: أزرار واضحة (مناسبة لشاشات الدخول) */
  variant?: "compact" | "full";
}

export function LanguageSwitcher({ variant = "compact" }: LanguageSwitcherProps) {
  const { i18n } = useTranslation();
  const currentLanguage = i18n.language as SupportedLanguage;

  if (variant === "full") {
    return (
      <div className="flex justify-center gap-2">
        {SUPPORTED_LANGUAGES.map((lang) => (
          <button
            key={lang}
            type="button"
            onClick={() => void changeLanguage(lang)}
            className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
              currentLanguage === lang ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
            }`}
          >
            {LANGUAGE_LABELS[lang]}
          </button>
        ))}
      </div>
    );
  }

  return (
    <select
      value={currentLanguage}
      onChange={(e) => void changeLanguage(e.target.value as SupportedLanguage)}
      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm text-slate-600"
      aria-label="Language"
    >
      {SUPPORTED_LANGUAGES.map((lang) => (
        <option key={lang} value={lang}>
          {LANGUAGE_LABELS[lang]}
        </option>
      ))}
    </select>
  );
}
