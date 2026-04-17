/**
 * 보트 카드·리스트용 생명주기 상태 (현재 시각 기준)
 * - active: 베팅 마감 전
 * - waiting: 마감 후 ~ 결과 확정 예정 시각 전
 * - completed: 결과 확정 시각 경과 또는 정산(적중) 처리 완료
 */
export type MarketLifecyclePhase = "active" | "waiting" | "completed";

export function getMarketLifecyclePhase(
  endsAt: Date,
  opts: {
    now?: Date;
    /** 결과 확정(발표) 예정 시각 */
    resultAt?: Date | null;
    /** 정산 완료(적중 옵션 확정) 시 DB/스토리지 플래그 */
    settled?: boolean;
  } = {},
): MarketLifecyclePhase {
  const now = opts.now?.getTime() ?? Date.now();
  if (opts.settled) return "completed";

  const close = endsAt.getTime();
  const confirmed = opts.resultAt?.getTime();

  if (now < close) return "active";

  if (confirmed != null && Number.isFinite(confirmed)) {
    if (now >= confirmed) return "completed";
    return "waiting";
  }
  return "waiting";
}

