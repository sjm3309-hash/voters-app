"use client";

import { loadAuthUser } from "@/lib/auth";

export type MarketComment = {
  id: string;
  marketId: string;
  author: string;
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

export function addMarketComment(marketId: string, content: string): MarketComment | null {
  const trimmed = content.trim();
  if (!trimmed) return null;
  const author = loadAuthUser()?.name?.trim() || "익명";
  const next: MarketComment = {
    id: `${Date.now()}`,
    marketId,
    author,
    content: trimmed,
    createdAt: new Date().toISOString(),
  };
  const all = loadAll();
  all.push(next);
  saveAll(all);
  return next;
}

