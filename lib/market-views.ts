"use client";

const STORAGE_KEY = "voters.market.views.v1";

function loadMap(): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, number>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveMap(map: Record<string, number>): void {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  window.dispatchEvent(new CustomEvent("voters:marketViewsUpdated"));
}

export function getMarketViews(marketId: string): number {
  return loadMap()[marketId] ?? 0;
}

export function incrementMarketViews(marketId: string): number {
  const map = loadMap();
  const next = (map[marketId] ?? 0) + 1;
  map[marketId] = next;
  saveMap(map);
  return next;
}

