import type { Market } from "@/components/market-card";
import { OFFICIAL_BET_AUTHOR_NAME } from "@/lib/admin-sync-bets";
import { getTeamColor } from "@/lib/team-colors";
import type { UserMarket } from "@/lib/markets";

/** Supabase public.bets 행 (피드·상세용 최소 필드) */
export type BetRowPublic = {
  id: string;
  title: string;
  closing_at: string;
  confirmed_at?: string | null;
  created_at?: string | null;
  /** 동기화 파이프라인에서 설정 (active / waiting / closed 등) */
  status?: string | null;
  category: string | null;
  sub_category: string | null;
  color: string | null;
  /** 동기화 시 저장한 선택지 라벨 배열 (없으면 title 기준 2지선다 파싱) */
  options?: unknown;
  is_admin_generated?: boolean | null;
  author_name?: string | null;
};

/** betRowToMarket 결과 — UI·API 응답 확장 필드 포함 */
export type BetRowMarketView = Omit<Market, "category" | "endsAt"> & {
  category: Market["category"];
  subCategory?: string;
  subCategoryLabel?: string;
  endsAt: Date;
  resultAt?: Date;
  accentColor?: string;
  isOfficial?: boolean;
  officialAuthorName?: string;
};

export function parseVsTitle(title: string): [string, string] {
  const parts = title.trim().split(/\s+vs\.?\s+/i);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return [parts[0].trim(), parts[1].trim()];
  }
  return ["홈", "원정"];
}

function parseOptionsColumn(raw: unknown): string[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  const labels = raw.filter((x): x is string => typeof x === "string" && x.trim() !== "");
  return labels.length > 0 ? labels : null;
}

/** 동일 비율 표시용 퍼센트 (합 100) */
function equalSplitPercentages(n: number): number[] {
  if (n <= 0) return [];
  const base = Math.floor(100 / n);
  const rem = 100 - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

function mapDbCategoryToMarket(category: string | null): Market["category"] {
  const c = (category ?? "").trim();
  if (c === "게임") return "game";
  if (c === "스포츠") return "sports";
  if (c === "정치") return "politics";
  if (c === "주식") return "stocks";
  if (c === "크립토") return "crypto";
  if (c === "재미") return "fun";
  const lower = c.toLowerCase();
  if (lower === "game") return "game";
  if (lower === "sports" || lower === "sport") return "sports";
  if (lower === "politics") return "politics";
  if (lower === "stocks" || lower === "stock") return "stocks";
  if (lower === "crypto") return "crypto";
  if (lower === "fun") return "fun";
  return "sports";
}

export type MarketStoredSubCategory =
  | "football"
  | "baseball_kr"
  | "basketball"
  | "domestic"
  | "overseas"
  | "lol"
  | "valorant"
  | "starcraft"
  | "other";

function mapDbSubCategory(sub: string | null): MarketStoredSubCategory | undefined {
  if (!sub) return undefined;
  const table: Record<string, MarketStoredSubCategory> = {
    해외축구: "football",
    국내야구: "baseball_kr",
    KBO: "baseball_kr",
    "KBO 리그": "baseball_kr",
    농구: "basketball",
    KBL: "basketball",
    NBA: "basketball",
    국내: "domestic",
    해외: "overseas",
    국내주식: "domestic",
    해외주식: "overseas",
    국내정치: "domestic",
    해외정치: "overseas",
    LoL: "lol",
    VALORANT: "valorant",
    Valorant: "valorant",
    발로란트: "valorant",
    LCK: "lol",
    StarCraft: "starcraft",
    "StarCraft 2": "starcraft",
    스타크래프트: "starcraft",
    "스타크래프트 2": "starcraft",
    SC2: "starcraft",
  };
  return table[sub] ?? "other";
}

export function betRowToMarket(row: BetRowPublic): BetRowMarketView {
  const fromCol = parseOptionsColumn(row.options);
  const [home, away] = parseVsTitle(row.title);
  const labels = fromCol && fromCol.length >= 2 ? fromCol : [home, away];
  const pcts = equalSplitPercentages(labels.length);
  const options = labels.map((label, i) => ({
    id: `${row.id}-opt-${i}`,
    label,
    percentage: pcts[i] ?? Math.floor(100 / labels.length),
    color: getTeamColor(label),
  }));
  const cHome = getTeamColor(home);
  const confirmedRaw = row.confirmed_at != null && String(row.confirmed_at).trim() !== "";
  const resultAt = confirmedRaw ? new Date(row.confirmed_at as string) : undefined;
  const resultValid = resultAt && !Number.isNaN(resultAt.getTime()) ? resultAt : undefined;

  return {
    id: row.id,
    question: row.title,
    category: mapDbCategoryToMarket(row.category),
    subCategory: mapDbSubCategory(row.sub_category),
    subCategoryLabel: row.sub_category?.trim() || undefined,
    options,
    totalPool: 0,
    comments: 0,
    endsAt: new Date(row.closing_at),
    resultAt: resultValid,
    accentColor:
      row.color?.trim() ||
      cHome ||
      getTeamColor(labels[0] ?? home),
    isOfficial:
      row.is_admin_generated === true ||
      row.author_name?.trim() === OFFICIAL_BET_AUTHOR_NAME,
    officialAuthorName:
      row.author_name?.trim() ||
      (row.is_admin_generated ? OFFICIAL_BET_AUTHOR_NAME : undefined),
  };
}

export function betRowToSyncedDetail(row: BetRowPublic): UserMarket {
  const m = betRowToMarket(row);
  return {
    id: m.id,
    question: m.question,
    description: "동기화된 경기 보트입니다. 공식 경기 결과를 기준으로 정산됩니다.",
    category: m.category,
    options: m.options,
    totalPool: 0,
    participants: 0,
    endsAt: m.endsAt.toISOString(),
    resultAt: m.resultAt?.toISOString(),
    createdAt: new Date().toISOString(),
    resolver: "공식 경기 결과",
    authorId: "sync",
    authorName: OFFICIAL_BET_AUTHOR_NAME,
  };
}
