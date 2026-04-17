"use client";

export type MarketBet = {
  id: string;
  marketId: string;
  optionId: string;
  amount: number;
  author: string;   // 표시 이름
  userId?: string;  // Supabase UUID (정산에 사용)
  createdAt: string; // ISO
};

const STORAGE_KEY = "voters.market.bets.v1";

function loadAll(): MarketBet[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MarketBet[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAll(next: MarketBet[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("voters:marketBetsUpdated"));
}

export function addMarketBet(
  marketId: string,
  optionId: string,
  amount: number,
  author = "익명",
  userId?: string,
): MarketBet | null {
  const a = Math.floor(Number(amount));
  if (!Number.isFinite(a) || a <= 0) return null;
  const next: MarketBet = {
    id: `${Date.now()}`,
    marketId,
    optionId,
    amount: a,
    author,
    userId,
    createdAt: new Date().toISOString(),
  };
  const all = loadAll();
  all.push(next);
  saveAll(all);
  return next;
}

/** 특정 유저(userId)가 해당 마켓의 특정 선택지에 건 페블 합계 */
export function getUserBetsOnOption(marketId: string, optionId: string, userId: string): number {
  if (!userId || userId === "anon") return 0;
  return loadAll()
    .filter((b) => b.marketId === marketId && b.optionId === optionId && b.userId === userId)
    .reduce((acc, b) => acc + b.amount, 0);
}

export function getBetsForMarket(marketId: string): MarketBet[] {
  return loadAll()
    .filter((b) => b.marketId === marketId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

