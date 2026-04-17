"use client";

// ─── 옵션 색상 팔레트 ─────────────────────────────────────────────────────────
export const OPTION_COLORS = [
  "oklch(0.7 0.18 230)",  // 파랑
  "oklch(0.7 0.18 150)",  // 초록
  "oklch(0.65 0.22 25)",  // 빨강
  "oklch(0.75 0.15 80)",  // 노랑
  "oklch(0.65 0.2 300)",  // 보라
];

// ─── 카테고리 ─────────────────────────────────────────────────────────────────
export const MARKET_CATEGORIES = [
  { id: "sports",   label: "스포츠" },
  { id: "fun",      label: "재미" },
  { id: "stocks",   label: "주식" },
  { id: "crypto",   label: "크립토" },
  { id: "politics", label: "정치" },
  { id: "game",     label: "게임" },
  { id: "suggest",  label: "건의" },
] as const;

export type MarketCategoryId = typeof MARKET_CATEGORIES[number]["id"];

// ─── 타입 ──────────────────────────────────────────────────────────────────────
export interface UserMarketOption {
  id: string;
  label: string;
  percentage: number;
  color: string;
}

export interface UserMarket {
  id: string;
  question: string;
  description: string;
  category: string;
  /** category가 game일 때 e스포츠 세부 분류 */
  subCategory?: "lol" | "valorant" | "starcraft" | "other";
  options: UserMarketOption[];
  totalPool: number;
  participants: number;
  endsAt: string;            // ISO string (KST → UTC 변환 후 저장)
  resultAt?: string;         // 결과 발표 일시 (ISO string)
  createdAt: string;
  resolver: string;
  authorId: string;
  authorName: string;
  // ─── 정산 ───────────────────────────────────────────────────────────────
  winningOptionId?: string;  // 정산된 당첨 선택지 ID
  settledAt?: string;        // 정산 일시 (ISO string)
  adminFeeCollected?: number;
  creatorFeeCollected?: number;
}

// ─── Storage ──────────────────────────────────────────────────────────────────
const STORAGE_KEY = "voters.user.markets.v1";

export function loadUserMarkets(): UserMarket[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as UserMarket[];
  } catch {
    return [];
  }
}

export function saveUserMarket(market: UserMarket): void {
  if (typeof window === "undefined") return;
  const all = loadUserMarkets();
  all.unshift(market); // 최신 순
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  window.dispatchEvent(new CustomEvent("voters:marketsUpdated"));
}

export function getUserMarketById(id: string): UserMarket | null {
  return loadUserMarkets().find((m) => m.id === id) ?? null;
}

/** 기존 보트 업데이트 (id 일치하는 항목을 교체) */
export function updateUserMarket(market: UserMarket): void {
  if (typeof window === "undefined") return;
  const all = loadUserMarkets();
  const idx = all.findIndex((m) => m.id === market.id);
  if (idx === -1) return;
  all[idx] = market;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
  window.dispatchEvent(new CustomEvent("voters:marketsUpdated"));
}

/** 새 보트용 고유 ID 생성 */
export function generateMarketId(): string {
  return `um-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
