import type { BetHistoryFlavor } from "@/lib/bet-history-flavor";
import { betHistoryOptionCol, readOptionIdFromRow } from "@/lib/bet-history-flavor";

export type UserStakeSummary = {
  totalAmount: number;
  representativeOptionId: string;
  /** 옵션 id → 금액 (내림차순 정렬된 배열로도 접근 가능) */
  stakeByOptionId: Record<string, number>;
};

/**
 * bet_history 행들을 유저별로 합산하고, 금액이 가장 큰 옵션을 대표 진영으로 선택합니다.
 * 동액이면 option_id 문자열 오름차순으로 결정합니다.
 */
export function aggregateStakesByUserFromHistoryRows(
  rows: Record<string, unknown>[],
  flavor: BetHistoryFlavor,
): Record<string, UserStakeSummary> {
  const perUser = new Map<string, Map<string, number>>();

  for (const r of rows) {
    const uid = String(r.user_id ?? "").trim();
    if (!uid) continue;
    const oid = readOptionIdFromRow(flavor, r as Record<string, unknown>);
    const amt = Math.floor(Number(r.amount ?? 0));
    if (!oid || !Number.isFinite(amt) || amt <= 0) continue;
    let m = perUser.get(uid);
    if (!m) {
      m = new Map();
      perUser.set(uid, m);
    }
    m.set(oid, (m.get(oid) ?? 0) + amt);
  }

  const out: Record<string, UserStakeSummary> = {};

  for (const [uid, optMap] of perUser) {
    let totalAmount = 0;
    for (const v of optMap.values()) totalAmount += v;

    const sorted = [...optMap.entries()].sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      return a[0].localeCompare(b[0]);
    });

    const representativeOptionId = sorted[0]?.[0] ?? "";
    const stakeByOptionId: Record<string, number> = {};
    for (const [oid, amt] of optMap) stakeByOptionId[oid] = amt;

    out[uid] = { totalAmount, representativeOptionId, stakeByOptionId };
  }

  return out;
}

/** 디버깅용 — 컬럼 이름 확인 */
export function stakeHistorySelectColumns(flavor: BetHistoryFlavor): string {
  const oc = betHistoryOptionCol(flavor);
  return `${oc}, amount, user_id`;
}
