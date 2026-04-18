"use client";

import * as React from "react";

type Theme = "light" | "dark" | "system";

export type AppThemeProviderProps = React.PropsWithChildren<{
  attribute?: "class";
  defaultTheme?: Theme;
  enableSystem?: boolean;
  disableTransitionOnChange?: boolean;
}>;

export type AppUseThemeResult = {
  theme: Theme | undefined;
  setTheme: (theme: Theme) => void;
  themes: string[];
  systemTheme?: "dark" | "light";
  resolvedTheme?: "dark" | "light";
};

const STORAGE_KEY = "theme";

const ThemeContext = React.createContext<AppUseThemeResult | undefined>(undefined);

function getSystemTheme(): "dark" | "light" {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function ThemeProvider({
  children,
  defaultTheme = "light",
  enableSystem = true,
  disableTransitionOnChange = false,
}: AppThemeProviderProps) {
  const [theme, setThemeState] = React.useState<Theme>(defaultTheme);
  const [systemTheme, setSystemTheme] = React.useState<"dark" | "light">("light");
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    setMounted(true);
    setSystemTheme(getSystemTheme());
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
      if (stored === "light" || stored === "dark") {
        setThemeState(stored);
      } else if (stored === "system" && enableSystem) {
        setThemeState("system");
      }
    } catch {
      /* ignore */
    }
  }, [enableSystem]);

  React.useEffect(() => {
    if (!mounted) return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemTheme(getSystemTheme());
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [mounted]);

  const resolvedTheme = React.useMemo<"dark" | "light">(() => {
    if (theme === "system") return systemTheme;
    return theme === "dark" ? "dark" : "light";
  }, [theme, systemTheme]);

  React.useEffect(() => {
    if (!mounted || typeof document === "undefined") return;

    let cleanupTransitionLock: (() => void) | undefined;
    if (disableTransitionOnChange) {
      const css = document.createElement("style");
      css.setAttribute("data-app-theme-transition-lock", "");
      css.appendChild(
        document.createTextNode(
          "*,*::before,*::after{-webkit-transition:none!important;-moz-transition:none!important;-o-transition:none!important;-ms-transition:none!important;transition:none!important}",
        ),
      );
      document.head.appendChild(css);
      cleanupTransitionLock = () => {
        window.getComputedStyle(document.body);
        setTimeout(() => css.remove(), 1);
      };
    }

    const resolved =
      theme === "system" ? getSystemTheme() : theme === "dark" ? "dark" : "light";
    const root = document.documentElement;
    root.classList.toggle("dark", resolved === "dark");
    root.style.colorScheme = resolved;

    cleanupTransitionLock?.();
  }, [mounted, theme, disableTransitionOnChange, systemTheme]);

  const setTheme = React.useCallback((next: Theme) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  const themes = React.useMemo(
    () => (enableSystem ? (["light", "dark", "system"] as const) : (["light", "dark"] as const)),
    [enableSystem],
  );

  const value = React.useMemo<AppUseThemeResult>(
    () => ({
      theme,
      setTheme,
      themes: [...themes],
      systemTheme,
      resolvedTheme,
    }),
    [theme, setTheme, themes, systemTheme, resolvedTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): AppUseThemeResult {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) {
    return {
      theme: undefined,
      setTheme: () => {},
      themes: [],
    };
  }
  return ctx;
}
