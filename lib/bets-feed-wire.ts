import type { Market } from "@/components/market-card";
import {
  betRowToMarket,
  type BetRowPublic,
} from "@/lib/bets-market-mapper";

/** API·JSON 직렬화용 보트 (ISO 문자열) */
/** bet_history 기준 선택지별 페블 → 표시용 % (합 100) */
function optionsWithStakePercentages(
  options: Market["options"],
  stakes: Record<string, number> | null | undefined,
): Market["options"] {
  if (!stakes || Object.keys(stakes).length === 0) return options;
  const ids = options.map((o) => o.id);
  const amounts = ids.map((id) => Math.max(0, Math.floor(stakes[id] ?? 0)));
  const sum = amounts.reduce((a, b) => a + b, 0);
  if (sum <= 0) return options;

  const exact = amounts.map((a) => (100 * a) / sum);
  const floor = exact.map((x) => Math.floor(x));
  let rem = 100 - floor.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < rem; k++) {
    const idx = order[k]?.i;
    if (idx !== undefined) floor[idx]++;
  }
  return options.map((o, i) => ({ ...o, percentage: floor[i] ?? 0 }));
}

export type BetFeedMarketWire = {
  id: string;
  question: string;
  category: Market["category"];
  subCategory?: Market["subCategory"];
  subCategoryLabel?: string;
  options: Market["options"];
  totalPool: number;
  comments: number;
  endsAt: string;
  createdAt?: string;
  resultAt?: string;
  accentColor?: string;
  isOfficial?: boolean;
  officialAuthorName?: string;
  /** `bets.author_name` 표시용 */
  authorName?: string;
  /** DB 작성자(auth.users.id) — 유저 생성 보트 정산 등 */
  creatorUserId?: string | null;
  winningOptionId?: string;
  /** DB `confirmed_at` — 결과 확정 시각 */
  confirmedAt?: string;
  /** DB `status` — settled / refunded / cancelled 등 */
  status?: string;
  /** 보트 상세 설명 */
  description?: string;
  /** 정산 기준 */
  resolver?: string;
};

export function betRowToFeedWire(
  row: BetRowPublic,
  totalPoolOverride: number,
  optionStakes?: Record<string, number> | null,
): BetFeedMarketWire {
  const m = betRowToMarket(row);
  const options = optionsWithStakePercentages(m.options, optionStakes ?? null);
  const createdAt =
    row.created_at && String(row.created_at).trim()
      ? new Date(row.created_at).toISOString()
      : undefined;
  const r = row as BetRowPublic & { user_id?: string | null };
  return {
    id: m.id,
    question: m.question,
    category: m.category,
    subCategory: m.subCategory,
    subCategoryLabel: (row.sub_category ?? "").trim() || undefined,
    options,
    totalPool: totalPoolOverride,
    comments: m.comments,
    endsAt: m.endsAt.toISOString(),
    createdAt,
    resultAt: m.resultAt?.toISOString(),
    accentColor: m.accentColor,
    isOfficial: m.isOfficial,
    officialAuthorName: m.officialAuthorName,
    authorName: row.author_name?.trim() || undefined,
    creatorUserId: r.user_id ?? null,
    winningOptionId: m.winningOptionId,
    confirmedAt:
      row.confirmed_at && String(row.confirmed_at).trim()
        ? new Date(row.confirmed_at as string).toISOString()
        : undefined,
    status: row.status ?? undefined,
    description: row.description ? String(row.description).trim() || undefined : undefined,
    resolver: row.resolver ? String(row.resolver).trim() || undefined : undefined,
  };
}

export function parseFeedWireToMarket(w: BetFeedMarketWire): Market {
  return {
    id: w.id,
    question: w.question,
    category: w.category,
    subCategory: w.subCategory,
    subCategoryLabel: w.subCategoryLabel,
    options: w.options,
    totalPool: w.totalPool,
    comments: w.comments,
    endsAt: new Date(w.endsAt),
    createdAt: w.createdAt ? new Date(w.createdAt) : undefined,
    resultAt: w.resultAt ? new Date(w.resultAt) : undefined,
    accentColor: w.accentColor,
    isOfficial: w.isOfficial,
    officialAuthorName: w.officialAuthorName,
    winningOptionId: w.winningOptionId,
  };
}
