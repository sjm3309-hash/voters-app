import type { BetRowPublic } from "@/lib/bets-market-mapper";

/**
 * 공개 메인 피드 진열 규칙 (서버에서 DB 쿼리로 충족시키고, 여기서는 최종 검증용)
 * - active / waiting (또는 status 없음 → active 취급): 항상 포함
 * - 종료류(closed 등): confirmed_at 이후 3일 이내만 (confirmed_at 타임스탬프 기준)
 */
export function rowPassesPublicFeedGate(
  row: BetRowPublic,
  threeDaysAgoMs: number,
): boolean {
  const raw = String(row.status ?? "active").toLowerCase().trim();
  const s = raw === "" ? "active" : raw;

  if (s === "active" || s === "waiting") return true;

  const terminal = new Set([
    "closed",
    "settled",
    "resolved",
    "completed",
    "cancelled",
    "void",
  ]);
  if (!terminal.has(s)) return false;

  const ca = row.confirmed_at ? Date.parse(String(row.confirmed_at)) : NaN;
  if (!Number.isFinite(ca)) return false;
  return ca >= threeDaysAgoMs;
}
