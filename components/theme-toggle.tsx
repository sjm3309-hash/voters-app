"use client";

import { useTheme } from "@/components/theme-provider";
import { Sun, Moon } from "lucide-react";
import { useEffect, useState } from "react";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <button
        className="p-2 rounded-lg bg-secondary transition-colors"
        aria-label="Toggle theme"
      >
        <div className="size-5" />
      </button>
    );
  }

  const isDark = resolvedTheme === "dark";

  return (
    <button
      onClick={() => setTheme(isDark ? "light" : "dark")}
      className={[
        "relative p-2 rounded-lg bg-secondary hover:bg-secondary/80 group",
        "transition-[color,background-color,border-color,transform] duration-300 ease-in-out",
        "active:scale-[0.92]",
        "motion-reduce:transition-none motion-reduce:active:scale-100",
      ].join(" ")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      <div className="relative size-5 motion-reduce:transform-none group-active:rotate-180 motion-reduce:group-active:rotate-0 transition-transform duration-300">
        <Sun
          className={[
            "absolute inset-0 size-5 text-amber-500",
            "transition-[transform,opacity] duration-500",
            "[transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)]",
            "motion-reduce:transition-none",
            isDark ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100",
          ].join(" ")}
        />
        <Moon
          className={[
            "absolute inset-0 size-5 text-neon-blue",
            "transition-[transform,opacity] duration-500",
            "[transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)]",
            "motion-reduce:transition-none",
            isDark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0",
          ].join(" ")}
        />
      </div>
    </button>
  );
}
