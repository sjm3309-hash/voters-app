"use client";

export type HomeViewMode = "split" | "bets" | "board";

const STORAGE_KEY = "voters.home.viewMode.v1";

export function loadHomeViewMode(): HomeViewMode | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "split" || raw === "bets" || raw === "board") return raw;
  } catch {
    /* ignore */
  }
  return null;
}

export function saveHomeViewMode(mode: HomeViewMode): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore */
  }
}

