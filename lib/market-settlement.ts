"use client";

// ─── 수수료 구조 ─────────────────────────────────────────────────────────────
//
//  [정상]  expectedOdds = (totalPool × 0.9) / winPool >= 1.01
//          운영자 5% + 창작자 5% + 배당 풀 90%
//
//  [방어1] expectedOdds < 1.01 이지만 totalPool > winPool × 1.01
//          승자 분배금을 winPool × 1.01 로 고정(최소 배당률 보장)
//          남은 돈에서 창작자 몫을 먼저, 그 다음 운영자가 가져감
//
//  [방어2] totalPool <= winPool × 1.01  (극단적 정배당 쏠림)
//          수수료 전액 포기, 있는 돈을 모두 승자에게 분배

export const ADMIN_FEE_RATE   = 0.05;  // 5%
export const CREATOR_FEE_RATE = 0.05;  // 5%
export const DIVIDEND_RATE    = 0.90;  // 90%
export const MIN_ODDS         = 1.01;  // 최소 보장 배당률

export interface FeeBreakdown {
  totalPool:    number;
  adminFee:     number;
  creatorFee:   number;
  dividendPool: number;
  /** 적용된 정산 시나리오 */
  scenario:     "normal" | "defense1" | "defense2";
}

/**
 * 총 페블 풀에서 수수료 및 배당 풀을 계산합니다.
 *
 * @param totalPool  전체 베팅 합계 (winPool + losePool)
 * @param winPool    당첨 선택지에 베팅된 합계
 *
 * 역배당(승자 원금 손실) 방지를 위해 3단계 시나리오를 적용합니다.
 *
 *  - 정상: expectedOdds >= 1.01 → 수수료 각 5%, 배당 풀 90%
 *  - 방어1: 1.01배 미만이지만 totalPool > winPool × 1.01
 *           → dividendPool = ceil(winPool × 1.01), 창작자 수수료 우선 할당
 *  - 방어2: totalPool <= winPool × 1.01 (극단 쏠림)
 *           → 수수료 0, dividendPool = totalPool 전액
 */
export function calculateFees(totalPool: number, winPool: number): FeeBreakdown {
  if (winPool <= 0) {
    return { totalPool, adminFee: 0, creatorFee: 0, dividendPool: 0, scenario: "defense2" };
  }

  const expectedOdds = (totalPool * DIVIDEND_RATE) / winPool;

  // ── 정상 상황 ─────────────────────────────────────────────────────────────
  if (expectedOdds >= MIN_ODDS) {
    const adminFee    = Math.floor(totalPool * ADMIN_FEE_RATE);
    const creatorFee  = Math.ceil(totalPool * CREATOR_FEE_RATE);
    const dividendPool = Math.max(0, totalPool - adminFee - creatorFee);
    return { totalPool, adminFee, creatorFee, dividendPool, scenario: "normal" };
  }

  // 최소 보장 지급액: 승자 원금 × 1.01배 (올림 처리)
  const requiredPayout = Math.ceil(winPool * MIN_ODDS);

  // ── 방어 상황 2: 풀 자체가 최소 지급에도 못 미치는 극단 쏠림 ────────────
  if (totalPool <= requiredPayout) {
    return { totalPool, adminFee: 0, creatorFee: 0, dividendPool: totalPool, scenario: "defense2" };
  }

  // ── 방어 상황 1: 최소 배당률 강제 고정 후 창작자 우선 할당 ──────────────
  const leftOver         = totalPool - requiredPayout;
  const targetCreatorFee = Math.ceil(totalPool * CREATOR_FEE_RATE);
  const creatorFee       = Math.min(targetCreatorFee, leftOver);
  const adminFee         = Math.max(0, leftOver - creatorFee);
  return { totalPool, adminFee, creatorFee, dividendPool: requiredPayout, scenario: "defense1" };
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
