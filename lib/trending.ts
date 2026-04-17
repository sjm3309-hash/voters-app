"use client";

import { getLikeCount } from "@/lib/likes";
import { getBetsForMarket } from "@/lib/market-bets";

// ─── 트렌딩 점수 공식 ─────────────────────────────────────────────────────────
//
//  rawScore  = (베팅인원 × 10) + (베팅페블 ÷ 1000) + (좋아요 × 5) + (댓글 × 15)
//  decay     = (ageHours + 2) ^ 1.5
//  finalScore = rawScore / decay
//
//  ageHours : 보트가 게시된 이후 경과 시간(시간 단위)
//             createdAt 이 없으면 24h 로 간주

export function calcTrendingScore({
  participants,
  totalPool,
  likes,
  comments,
  ageHours,
}: {
  participants: number;
  totalPool: number;
  likes: number;
  comments: number;
  ageHours: number;
}): number {
  const raw =
    participants * 10 +
    totalPool / 1000 +
    likes * 5 +
    comments * 15;
  const decay = Math.pow(Math.max(0, ageHours) + 2, 1.5);
  return raw / decay;
}

/**
 * 마켓 한 개의 트렌딩 점수를 localStorage 데이터로 계산합니다.
 * (클라이언트에서만 호출 가능)
 */
export function marketTrendingScore(market: {
  id: string;
  totalPool: number;
  comments: number;
  createdAt?: Date;
}): number {
  const bets         = getBetsForMarket(market.id);
  const participants = new Set(bets.map((b) => b.userId ?? b.author)).size;
  const likes        = getLikeCount({ type: "market", id: market.id });
  const ageMs        = market.createdAt
    ? Date.now() - market.createdAt.getTime()
    : 24 * 60 * 60 * 1000; // createdAt 없으면 24h 기본
  const ageHours     = ageMs / (1000 * 60 * 60);

  return calcTrendingScore({
    participants,
    totalPool:  market.totalPool,
    likes,
    comments:   market.comments,
    ageHours,
  });
}
