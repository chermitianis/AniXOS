import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

// ============================================================================
// Theme system — AniXOS
// ----------------------------------------------------------------------------
// - 3 modes : "light" | "dark" | "system"
// - "system" suit les préférences OS (prefers-color-scheme).
// - Le mode choisi est persisté dans localStorage.
// - Sync automatique entre onglets.
// - Met à jour <meta name="theme-color"> pour le navigateur mobile.
// ============================================================================

export type Theme = "light" | "dark";
export type ThemeMode = Theme | "system";

interface ThemeContextValue {
  /** Le thème EFFECTIF (résolu : jamais "system"). */
  theme: Theme;
  /** Le mode choisi par l'utilisateur (peut être "system"). */
  mode: ThemeMode;
  /** Toggle rapide entre light et dark (sort du mode "system"). */
  toggleTheme: () => void;
  /** Définit explicitement le mode. */
  setTheme: (mode: ThemeMode) => void;
}

const STORAGE_KEY = "anixos-theme";

// Couleurs de la barre d'adresse du navigateur mobile (adaptées à la sidebar).
const THEME_COLORS: Record<Theme, string> = {
  light: "#f1f5f9",
  dark: "#0a0f1c",
};

const ThemeContext = createContext<ThemeContextValue>({
  theme: "light",
  mode: "system",
  toggleTheme: () => {},
  setTheme: () => {},
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readStoredMode(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "light" || v === "dark" || v === "system") return v;
  } catch {
    /* ignore */
  }
  return "system";
}

function getSystemTheme(): Theme {
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(mode: ThemeMode): Theme {
  return mode === "system" ? getSystemTheme() : mode;
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;

  // Classe .dark pour Tailwind + CSS variables
  root.classList.toggle("dark", theme === "dark");

  // color-scheme sur <html> (formulaires, scrollbar natifs)
  root.style.colorScheme = theme;

  // <meta name="theme-color"> pour la barre du navigateur mobile
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", THEME_COLORS[theme]);
  } else {
    const m = document.createElement("meta");
    m.name = "theme-color";
    m.content = THEME_COLORS[theme];
    document.head.appendChild(m);
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(readStoredMode);
  const [systemTheme, setSystemTheme] = useState<Theme>(getSystemTheme);

  // Thème résolu (effectif)
  const theme: Theme = mode === "system" ? systemTheme : mode;

  // Écoute les changements de préférence système (en continu)
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e: MediaQueryListEvent) => {
      setSystemTheme(e.matches ? "dark" : "light");
    };
    // Modern API
    if (mq.addEventListener) {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
    // Legacy fallback
    mq.addListener(onChange);
    return () => mq.removeListener(onChange);
  }, []);

  // Applique le thème dès qu'il change + persiste le mode
  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
  }, [theme, mode]);

  // Sync entre onglets du même navigateur
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return;
      const v = e.newValue;
      if (v === "light" || v === "dark" || v === "system") {
        setMode(v);
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // ---------------------------------------------------------------------------
  // Actions
  // ---------------------------------------------------------------------------

  /**
   * Toggle light ↔ dark.
   * Si on est en mode "system", on bascule vers l'opposé du système courant.
   */
  const toggleTheme = useCallback(() => {
    setMode((prev) => {
      const current = prev === "system" ? getSystemTheme() : prev;
      return current === "dark" ? "light" : "dark";
    });
  }, []);

  const setTheme = useCallback((next: ThemeMode) => {
    setMode(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ theme, mode, toggleTheme, setTheme }),
    [theme, mode, toggleTheme, setTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);