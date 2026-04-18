import type { SupabaseClient } from "@supabase/supabase-js";

/** DB가 `market_id`/`option_id` 인지 `bet_id`/`choice` 인지 */
export type BetHistoryFlavor = "market_option" | "bet_choice";

let cachedFlavor: BetHistoryFlavor | null = null;

/** 테스트 등에서 스키마 캐시 초기화 */
export function resetBetHistoryFlavorCache(): void {
  cachedFlavor = null;
}

export async function getBetHistoryFlavor(svc: SupabaseClient): Promise<BetHistoryFlavor> {
  if (cachedFlavor) return cachedFlavor;
  const m = await svc.from("bet_history").select("market_id").limit(1);
  if (!m.error) {
    cachedFlavor = "market_option";
    return cachedFlavor;
  }
  const b = await svc.from("bet_history").select("bet_id").limit(1);
  if (!b.error) {
    cachedFlavor = "bet_choice";
    return cachedFlavor;
  }
  cachedFlavor = "market_option";
  return cachedFlavor;
}

export function betHistoryMarketCol(f: BetHistoryFlavor): "market_id" | "bet_id" {
  return f === "market_option" ? "market_id" : "bet_id";
}

export function betHistoryOptionCol(f: BetHistoryFlavor): "option_id" | "choice" {
  return f === "market_option" ? "option_id" : "choice";
}

export function buildBetHistoryInsert(
  f: BetHistoryFlavor,
  p: { marketId: string; optionId: string; userId: string; amount: number },
): Record<string, unknown> {
  if (f === "market_option") {
    return {
      market_id: p.marketId,
      option_id: p.optionId,
      user_id: p.userId,
      amount: p.amount,
    };
  }
  return {
    bet_id: p.marketId,
    choice: p.optionId,
    user_id: p.userId,
    amount: p.amount,
  };
}

export function readOptionIdFromRow(f: BetHistoryFlavor, row: Record<string, unknown>): string {
  const key = betHistoryOptionCol(f);
  return String(row[key] ?? "").trim();
}

/** 여러 마켓(bets.id)별 bet_history 금액 합 */
export async function sumPoolsByMarketIds(
  svc: SupabaseClient,
  ids: string[],
): Promise<Map<string, number>> {
  const poolBy = new Map<string, number>();
  if (ids.length === 0) return poolBy;
  const flavor = await getBetHistoryFlavor(svc);
  const col = betHistoryMarketCol(flavor);
  const { data: hist, error } = await svc
    .from("bet_history")
    .select(`${col}, amount`)
    .in(col, ids);
  if (error || !hist) return poolBy;
  for (const h of hist as Record<string, unknown>[]) {
    const mid = String(h[col] ?? "").trim();
    const amt = Math.floor(Number(h.amount ?? 0));
    if (!mid || !Number.isFinite(amt) || amt <= 0) continue;
    poolBy.set(mid, (poolBy.get(mid) ?? 0) + amt);
  }
  return poolBy;
}

/** 마켓(bets.id)별 · 선택지(option id)별 bet_history 금액 합 */
export async function sumOptionStakesByMarketIds(
  svc: SupabaseClient,
  marketIds: string[],
): Promise<Map<string, Record<string, number>>> {
  const out = new Map<string, Record<string, number>>();
  if (marketIds.length === 0) return out;
  const flavor = await getBetHistoryFlavor(svc);
  const marketCol = betHistoryMarketCol(flavor);
  const optionCol = betHistoryOptionCol(flavor);

  const { data: hist, error } = await svc
    .from("bet_history")
    .select(`${marketCol}, ${optionCol}, amount`)
    .in(marketCol, marketIds);

  if (error || !hist) return out;

  for (const h of hist as Record<string, unknown>[]) {
    const mid = String(h[marketCol] ?? "").trim();
    const oid = readOptionIdFromRow(flavor, h);
    const amt = Math.floor(Number(h.amount ?? 0));
    if (!mid || !oid || !Number.isFinite(amt) || amt <= 0) continue;
    const per = out.get(mid) ?? {};
    per[oid] = (per[oid] ?? 0) + amt;
    out.set(mid, per);
  }
  return out;
}
