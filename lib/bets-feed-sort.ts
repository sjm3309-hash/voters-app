/**
 * 홈 bets-feed — 유저 경험용 스마트 정렬 (상태 가중치 + 시간 + 트렌딩)
 */

export type FeedListState = "active" | "waiting" | "closed";

export type BetFeedSortInput = {
  id: string;
  status?: string | null;
  closing_at: string;
  confirmed_at?: string | null;
  created_at?: string | null;
};

const TERMINAL_STATUS = new Set([
  "closed",
  "settled",
  "resolved",
  "cancelled",
  "void",
]);

/**
 * DB status + 마감/결과 시각으로 피드 구분 상태를 유도합니다.
 * - active: 베팅 가능 구간(마감 전) 또는 명시 active
 * - waiting: 마감 후 ~ 결과 확정 전
 * - closed: 정산·종료
 */
export function deriveFeedListState(
  row: BetFeedSortInput,
  nowMs: number,
): FeedListState {
  const raw = (row.status ?? "active").toLowerCase().trim();
  if (TERMINAL_STATUS.has(raw) || raw === "completed") return "closed";
  if (raw === "waiting") return "waiting";

  const closing = Date.parse(row.closing_at);
  if (!Number.isFinite(closing)) return "closed";

  const confirmed =
    row.confirmed_at != null && String(row.confirmed_at).trim() !== ""
      ? Date.parse(row.confirmed_at)
      : NaN;

  if (nowMs < closing) return "active";

  if (Number.isFinite(confirmed) && nowMs >= confirmed) return "closed";
  return "waiting";
}

const STATE_RANK: Record<FeedListState, number> = {
  active: 0,
  waiting: 1,
  closed: 2,
};

export type SmartSortMode = "smart" | "created_desc" | "closing_asc";

/**
 * @param poolByMarketId — bet_history 합산 페블 (없으면 0)
 */
export function sortBetFeedRows<T extends BetFeedSortInput>(
  rows: T[],
  nowMs: number,
  poolByMarketId: Map<string, number>,
  mode: SmartSortMode,
): T[] {
  return [...rows].sort((a, b) => {
    // '최신' 정렬: 상태/마감/풀 가중치 없이 created_at 내림차순만 적용
    if (mode === "created_desc") {
      const ca = a.created_at ? Date.parse(a.created_at) : 0;
      const cb = b.created_at ? Date.parse(b.created_at) : 0;
      const na = Number.isFinite(ca) ? ca : 0;
      const nb = Number.isFinite(cb) ? cb : 0;
      if (na !== nb) return nb - na;
      return a.id.localeCompare(b.id);
    }

    /** 마감 임박순 — 홈「최신」탭·카테고리 목록과 동일한 기준 */
    if (mode === "closing_asc") {
      const ca = Date.parse(a.closing_at);
      const cb = Date.parse(b.closing_at);
      const fa = Number.isFinite(ca) ? ca : Number.POSITIVE_INFINITY;
      const fb = Number.isFinite(cb) ? cb : Number.POSITIVE_INFINITY;
      if (fa !== fb) return fa - fb;
      return a.id.localeCompare(b.id);
    }

    const sa = deriveFeedListState(a, nowMs);
    const sb = deriveFeedListState(b, nowMs);
    const ra = STATE_RANK[sa];
    const rb = STATE_RANK[sb];
    if (ra !== rb) return ra - rb;

    const pa = poolByMarketId.get(a.id) ?? 0;
    const pb = poolByMarketId.get(b.id) ?? 0;

    if (sa === "active") {
      const closA = Date.parse(a.closing_at);
      const closB = Date.parse(b.closing_at);
      const fa = Number.isFinite(closA) ? closA : Number.POSITIVE_INFINITY;
      const fb = Number.isFinite(closB) ? closB : Number.POSITIVE_INFINITY;
      if (fa !== fb) return fa - fb;
      // 선택: 같은 마감 시간대면 인기(풀) 높은 순으로
      if (pb !== pa) return pb - pa;
    } else if (sa === "waiting") {
      const confA = a.confirmed_at
        ? Date.parse(a.confirmed_at)
        : Number.POSITIVE_INFINITY;
      const confB = b.confirmed_at
        ? Date.parse(b.confirmed_at)
        : Number.POSITIVE_INFINITY;
      const fa = Number.isFinite(confA) ? confA : Number.POSITIVE_INFINITY;
      const fb = Number.isFinite(confB) ? confB : Number.POSITIVE_INFINITY;
      if (fa !== fb) return fa - fb;
      // 선택: 같은 결과 확정 시각대면 인기(풀) 높은 순으로
      if (pb !== pa) return pb - pa;
    } else {
      // closed: 가장 최근에 끝난 순서 (confirmed_at 우선, 없으면 closing_at)
      const endA = a.confirmed_at ? Date.parse(a.confirmed_at) : Date.parse(a.closing_at);
      const endB = b.confirmed_at ? Date.parse(b.confirmed_at) : Date.parse(b.closing_at);
      const fa = Number.isFinite(endA) ? endA : 0;
      const fb = Number.isFinite(endB) ? endB : 0;
      if (fb !== fa) return fb - fa;
      // 선택: 같은 종료 시각이면 인기(풀) 높은 순으로
      if (pb !== pa) return pb - pa;
    }

    if (pb !== pa) return pb - pa;
    return a.id.localeCompare(b.id);
  });
}
