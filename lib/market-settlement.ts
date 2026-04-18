"use client";

// ─── 수수료 구조 ─────────────────────────────────────────────────────────────
//
//  총 페블  →  운영자 5%  +  보트 창작자 5%  +  배당 풀 90%
//  배당 풀은 해당 선택지에 베팅한 유저들이 비율대로 나눔
//  창작자 수수료는 올림(ceil) 처리 — 작은 풀에서도 정확히 챙김

export const ADMIN_FEE_RATE   = 0.05;  // 5%
export const CREATOR_FEE_RATE = 0.05;  // 5%
export const DIVIDEND_RATE    = 0.90;  // 90%

export interface FeeBreakdown {
  totalPool:    number;
  adminFee:     number;  // floor(total × 5%)
  creatorFee:   number;  // ceil(total × 5%)
  dividendPool: number;  // total - adminFee - creatorFee
}

/**
 * 총 페블 풀에서 수수료를 계산합니다.
 *
 * - 운영자 수수료: floor(total × 5%)
 * - 창작자 수수료: ceil(total × 5%)   ← 100P 미만 올림 처리 포함
 * - 배당 풀: total - adminFee - creatorFee
 */
export function calculateFees(totalPool: number): FeeBreakdown {
  const adminFee    = Math.floor(totalPool * ADMIN_FEE_RATE);
  const creatorFee  = Math.ceil(totalPool * CREATOR_FEE_RATE);
  const dividendPool = Math.max(0, totalPool - adminFee - creatorFee);
  return { totalPool, adminFee, creatorFee, dividendPool };
}

/**
 * 베팅 전 표시용 예상 배당금.
 *
 *   내 예상 배당금 = betAmount × (전체풀 / 선택지풀) × 90%
 *                  ≈ betAmount × (100 / optionPercentage) × 0.90
 *
 * 실제 정산 시에는 최종 베팅 분포로 재계산합니다.
 */
export function calculateExpectedPayout(betAmount: number, optionPercentage: number): number {
  if (betAmount <= 0 || optionPercentage <= 0) return 0;
  return Math.round(betAmount * (100 / optionPercentage) * DIVIDEND_RATE);
}

/**
 * 정산 시 특정 유저의 실제 배당금.
 *
 *   userPayout = (내 결과 베팅 / 전체 결과 베팅) × dividendPool
 */
export function calculateUserPayout(
  userBetsOnWinning: number,
  totalBetsOnWinning: number,
  dividendPool: number,
): number {
  if (totalBetsOnWinning <= 0 || userBetsOnWinning <= 0) return 0;
  return Math.floor((userBetsOnWinning / totalBetsOnWinning) * dividendPool);
}

// ─── 수령(claim) 추적 ─────────────────────────────────────────────────────────

const claimedKey = (userId: string, marketId: string) =>
  `voters.settlement.claimed.v1.${marketId}.${userId}`;

export function hasClaimedWinnings(userId: string, marketId: string): boolean {
  if (typeof window === "undefined" || !userId || userId === "anon") return false;
  return !!window.localStorage.getItem(claimedKey(userId, marketId));
}

export function markWinningsClaimed(userId: string, marketId: string): void {
  if (typeof window === "undefined" || !userId || userId === "anon") return;
  window.localStorage.setItem(claimedKey(userId, marketId), "1");
}
