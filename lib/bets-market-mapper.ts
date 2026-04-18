import type { Market } from "@/components/market-card";
import { OFFICIAL_BET_AUTHOR_NAME } from "@/lib/admin-sync-bets";
import { fallbackHexByIndex, parseStoredOptionColor } from "@/lib/option-colors";
import { DEFAULT_BRAND_COLOR, getTeamColor } from "@/lib/team-colors";
import type { UserMarket } from "@/lib/markets";

type StoredOptionRow = { label: string; storedColor: string | null };

/** Supabase public.bets 행 (피드·상세용 최소 필드) */
export type BetRowPublic = {
  id: string;
  title: string;
  closing_at: string;
  confirmed_at?: string | null;
  created_at?: string | null;
  /** 작성자 profiles.id / auth.users.id */
  user_id?: string | null;
  /** 동기화 파이프라인에서 설정 (active / waiting / closed 등) */
  status?: string | null;
  category: string | null;
  sub_category: string | null;
  color: string | null;
  /** 동기화 시 저장한 선택지 라벨 배열 (없으면 title 기준 2지선다 파싱) */
  options?: unknown;
  is_admin_generated?: boolean | null;
  author_name?: string | null;
  /** 정산 확정 시 클라이언트 옵션 id */
  winning_option_id?: string | null;
  /** 보트 상세 설명 */
  description?: string | null;
  /** 정산 기준 */
  resolver?: string | null;
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
  const labels = inferLabelsFromTitle(title);
  return [labels[0] ?? "홈", labels[1] ?? "원정"];
}

/**
 * DB `options`가 비었을 때 제목에서 선택지 라벨 추론 (`/` 또는 `vs` 등).
 * URL 형태 제목은 vs 패턴만 시도합니다.
 */
export function inferLabelsFromTitle(title: string): string[] {
  const t = title.trim();
  if (!t) return ["선택1", "선택2"];
  if (/^https?:\/\//i.test(t)) {
    const parts = t.split(/\s+vs\.?\s+/i).map((s) => s.trim()).filter(Boolean);
    if (parts.length >= 2) return [parts[0], parts[1]];
    return ["선택1", "선택2"];
  }
  const slash = t
    .split(/\s*\/\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (slash.length >= 2) return slash;
  const vsParts = t.split(/\s+vs\.?\s+/i).map((s) => s.trim()).filter(Boolean);
  if (vsParts.length >= 2) return [vsParts[0], vsParts[1]];
  return ["홈", "원정"];
}

function parseStoredOptionsDetailed(raw: unknown): StoredOptionRow[] | null {
  if (raw == null) return null;
  if (!Array.isArray(raw)) return null;
  const out: StoredOptionRow[] = [];
  for (const x of raw) {
    if (typeof x === "string") {
      const s = x.trim();
      if (s) out.push({ label: s, storedColor: null });
    } else if (x && typeof x === "object" && "label" in x) {
      const label = String((x as { label?: unknown }).label ?? "").trim();
      if (!label) continue;
      const rawCol = (x as { color?: unknown }).color;
      const storedColor = parseStoredOptionColor(rawCol);
      out.push({ label, storedColor });
    }
  }
  return out.length > 0 ? out : null;
}

function resolveStoredOptionsWithFallback(
  row: Pick<BetRowPublic, "title" | "options">,
): StoredOptionRow[] {
  const parsed = parseStoredOptionsDetailed(row.options);
  if (parsed && parsed.length >= 2) return parsed;
  return inferLabelsFromTitle(row.title).map((label) => ({
    label,
    storedColor: null,
  }));
}

/** DB 행 기준 최종 선택지 라벨 (컬럼 우선, 없거나 부족하면 제목 추론) */
export function resolveBetOptionLabels(row: Pick<BetRowPublic, "title" | "options">): string[] {
  return resolveStoredOptionsWithFallback(row).map((r) => r.label);
}

export function optionIdsForLabels(marketId: string, labels: string[]): string[] {
  return labels.map((_, i) => `${marketId}-opt-${i}`);
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
  const rows = resolveStoredOptionsWithFallback(row);
  const labels = rows.map((r) => r.label);
  const [home, away] = [labels[0] ?? "홈", labels[1] ?? "원정"];
  const pcts = equalSplitPercentages(labels.length);
  const options = rows.map((item, i) => {
    const stored = item.storedColor;
    const team = getTeamColor(item.label);
    const color =
      stored ??
      (team !== DEFAULT_BRAND_COLOR ? team : fallbackHexByIndex(i));
    return {
      id: `${row.id}-opt-${i}`,
      label: item.label,
      percentage: pcts[i] ?? Math.floor(100 / labels.length),
      color,
    };
  });
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
    winningOptionId: row.winning_option_id?.trim() || undefined,
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
