"use client";

import { loadAuthUser } from "@/lib/auth";

export type MarketComment = {
  id: string;
  marketId: string;
  author: string;
  /** Supabase auth user UUID — 서버 저장 실패 시 로컬 폴백에도 기록 */
  userId?: string;
  content: string;
  createdAt: string; // ISO
};

const STORAGE_KEY = "voters.market.comments.v1";

function loadAll(): MarketComment[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as MarketComment[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** 관리자 활동 보기 등 — 전체 보트 댓글 */
export function loadAllMarketComments(): MarketComment[] {
  return loadAll();
}

function saveAll(next: MarketComment[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event("voters:marketCommentsUpdated"));
}

export function getCommentsForMarket(marketId: string): MarketComment[] {
  return loadAll()
    .filter((c) => c.marketId === marketId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export function addMarketComment(
  marketId: string,
  content: string,
  /** 서버 저장 실패 폴백 시 전달 — stakesByUserId 매핑에 사용 */
  opts?: { author?: string; userId?: string },
): MarketComment | null {
  const trimmed = content.trim();
  if (!trimmed) return null;
  const author = opts?.author?.trim() || loadAuthUser()?.name?.trim() || "익명";
  const next: MarketComment = {
    id: `${Date.now()}`,
    marketId,
    author,
    userId: opts?.userId,
    content: trimmed,
    createdAt: new Date().toISOString(),
  };
  const all = loadAll();
  all.push(next);
  saveAll(all);
  return next;
}

