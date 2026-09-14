// ============================================================================
// إعداد نظام الترجمة (i18next)
//
// قرار جوهري: الفرنسية هي اللغة الرسمية والافتراضية للمنصة بالكامل. لا
// نستخدم LanguageDetector لاختيار لغة المتصفح تلقائياً كافتراضي (كان
// سيجعل جهازاً بمتصفح عربي يفتح على العربية دون قرار صريح من المستخدم)،
// بل نفرض 'fr' افتراضياً دائماً، ونحترم فقط اختياراً محفوظاً صراحة من
// المستخدم نفسه عبر مبدّل اللغة (localStorage).
// ============================================================================

import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import fr from "../locales/fr/translation.json";
import en from "../locales/en/translation.json";
import ar from "../locales/ar/translation.json";

export const SUPPORTED_LANGUAGES = ["fr", "en", "ar"] as const;
export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const RTL_LANGUAGES: SupportedLanguage[] = ["ar"];

const LANGUAGE_STORAGE_KEY = "anixos_language";
const DEFAULT_LANGUAGE: SupportedLanguage = "fr";

function getStoredLanguage(): SupportedLanguage {
  const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (stored && (SUPPORTED_LANGUAGES as readonly string[]).includes(stored)) {
    return stored as SupportedLanguage;
  }
  return DEFAULT_LANGUAGE;
}

/** يُحدِّث lang/dir على <html> بالكامل — يُستدعى عند الإقلاع وعند كل تغيير لغة */
export function applyDocumentDirection(language: SupportedLanguage) {
  document.documentElement.lang = language;
  document.documentElement.dir = RTL_LANGUAGES.includes(language) ? "rtl" : "ltr";
}

export async function changeLanguage(language: SupportedLanguage) {
  await i18n.changeLanguage(language);
  localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  applyDocumentDirection(language);
}

const initialLanguage = getStoredLanguage();

i18n.use(initReactI18next).init({
  resources: {
    fr: { translation: fr },
    en: { translation: en },
    ar: { translation: ar },
  },
  lng: initialLanguage,
  fallbackLng: DEFAULT_LANGUAGE,
  interpolation: { escapeValue: false },
  returnNull: false,
});

applyDocumentDirection(initialLanguage);

export default i18n;
