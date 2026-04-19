import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import type { BetRowPublic } from "@/lib/bets-market-mapper";
import { betRowToFeedWire } from "@/lib/bets-feed-wire";
import { rowPassesPublicFeedGate } from "@/lib/bets-feed-public-filter";
import {
  sortBetFeedRows,
  type SmartSortMode,
} from "@/lib/bets-feed-sort";
import { sumOptionStakesByMarketIds, sumPoolsByMarketIds } from "@/lib/bet-history-flavor";

/**
 * 공개 메인 피드 — Supabase `bets`만 사용 (서비스 롤: RLS와 무관하게 공개 카탈로그 조회).
 * 로그인 여부와 관계없이 동일 데이터. 악용 방지는 별도 rate limit 권장.
 *
 * 진열 규칙:
 * - `active` 또는 `waiting` → 항상 포함 (status null → active 취급은 앱 레벨 필터에서 처리)
 * - 종료류(`closed`, `settled`, `resolved`, `completed`, `cancelled`, `void`)
 *   → `confirmed_at`이 현재 시각 기준 3일 이내인 행만
 *
 * 쿼리 (DB 값과 띄어쓰기·대소문자 일치):
 * - `?category=게임` — 게임만
 * - `?category=게임&sub_category=LoL` — 게임·LoL 탭과 동일
 * - `?sort=created_desc` — 생성일 최신순 (상태 구분 없이 created_at 내림차순). 홈「최신」탭과 동일.
 * - `?sort=closing_asc` — 마감 시각 오름차순(임박한 순).
 * - `?offset=0&limit=10` — 위 정렬을 전체 적용한 뒤 **그 순서대로** 잘라서 반환 (무한 스크롤).
 *   (open/closed 두 쿼리를 합친 뒤 메모리에서 정렬하므로 Supabase `.range`는 단일 쿼리로 대체 불가)
 */

export const dynamic = "force-dynamic";

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const FETCH_OPEN_CAP = 350;
const FETCH_CLOSED_CAP = 350;

/** 오류 응답은 캐시하지 않음 */
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

/** 성공 피드 응답: 30초 엣지 캐시, 60초 stale-while-revalidate */
const FEED_CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
};

/** `*`: 정산 컬럼 마이그레이션 전 DB와 호환 (없는 컬럼은 결과에 포함되지 않음) */
const SELECT_FIELDS = "*";

/** 종료·정산 상태 — confirmed_at 3일 규칙 적용 */
const TERMINAL_STATUSES_FOR_FEED = [
  "closed",
  "settled",
  "resolved",
  "completed",
  "cancelled",
  "void",
] as const;

export async function GET(request: Request) {
  try {
    const nowMs = Date.now();
    const threeDaysAgoMs = nowMs - THREE_DAYS_MS;
    const threeDaysAgoISO = new Date(threeDaysAgoMs).toISOString();

    let supabase: ReturnType<typeof createServiceRoleClient>;
    try {
      supabase = createServiceRoleClient();
    } catch (envErr) {
      const msg = envErr instanceof Error ? envErr.message : String(envErr);
      return NextResponse.json(
        {
          ok: false,
          error: msg,
          code: "SERVICE_ROLE_CONFIG",
        },
        { status: 503, headers: NO_STORE_HEADERS },
      );
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category")?.trim();
    const subCategory = searchParams.get("sub_category")?.trim();
    const sort = searchParams.get("sort")?.trim();

    const rawOffset = Number.parseInt(searchParams.get("offset") ?? "0", 10);
    const rawLimit = Number.parseInt(searchParams.get("limit") ?? "10", 10);
    const offset =
      Number.isFinite(rawOffset) && rawOffset >= 0 ? Math.floor(rawOffset) : 0;
    const limit = Math.min(
      50,
      Math.max(1, Number.isFinite(rawLimit) ? Math.floor(rawLimit) : 10),
    );

    let qOpen = supabase
      .from("bets")
      .select(SELECT_FIELDS)
      .or("status.is.null,status.eq.active,status.eq.waiting")
      .order("created_at", { ascending: false })
      .range(0, FETCH_OPEN_CAP - 1);

    let qClosed = supabase
      .from("bets")
      .select(SELECT_FIELDS)
      .in("status", [...TERMINAL_STATUSES_FOR_FEED])
      .gte("confirmed_at", threeDaysAgoISO)
      .order("created_at", { ascending: false })
      .range(0, FETCH_CLOSED_CAP - 1);

    if (category) {
      qOpen = qOpen.eq("category", category);
      qClosed = qClosed.eq("category", category);
    }
    if (subCategory) {
      qOpen = qOpen.eq("sub_category", subCategory);
      qClosed = qClosed.eq("sub_category", subCategory);
    }

    const [openRes, closedRes] = await Promise.all([qOpen, qClosed]);

    if (openRes.error && closedRes.error) {
      return NextResponse.json(
        {
          ok: false,
          error: openRes.error.message ?? closedRes.error.message,
          code: openRes.error.code ?? closedRes.error.code,
        },
        { status: 500, headers: NO_STORE_HEADERS },
      );
    }

    const byId = new Map<string, BetRowPublic>();
    for (const r of (openRes.data ?? []) as BetRowPublic[]) {
      if (r?.id) byId.set(r.id, r);
    }
    for (const r of (closedRes.data ?? []) as BetRowPublic[]) {
      if (r?.id) byId.set(r.id, r);
    }

    let rawRows = [...byId.values()].filter((r) =>
      rowPassesPublicFeedGate(r, threeDaysAgoMs),
    );

    const ids = rawRows.map((r) => r.id).filter(Boolean);
    const [poolBy, stakesByMarket] =
      ids.length > 0
        ? await Promise.all([
            sumPoolsByMarketIds(supabase, ids),
            sumOptionStakesByMarketIds(supabase, ids),
          ])
        : [new Map<string, number>(), new Map<string, Record<string, number>>()];

    const sortMode: SmartSortMode =
      sort === "created_desc"
        ? "created_desc"
        : sort === "closing_asc"
          ? "closing_asc"
          : "smart";
    const sortedFull = sortBetFeedRows(rawRows, nowMs, poolBy, sortMode);
    const totalSorted = sortedFull.length;
    const pageRows = sortedFull.slice(offset, offset + limit);
    const hasMore = offset + pageRows.length < totalSorted;

    // 페이지에 포함된 보트들의 댓글 수 한 번에 집계
    const pageIds = pageRows.map((r) => r.id).filter(Boolean);
    const commentCountById = new Map<string, number>();
    if (pageIds.length > 0) {
      const cResult = await supabase
        .from("boat_comments")
        .select("bet_id")
        .in("bet_id", pageIds)
        .eq("is_deleted", false);
      const cRows = cResult.error ? null : cResult.data;
      if (cRows) {
        for (const r of cRows as { bet_id: string }[]) {
          commentCountById.set(r.bet_id, (commentCountById.get(r.bet_id) ?? 0) + 1);
        }
      } else {
        // is_deleted 컬럼 없는 경우 fallback (마이그레이션 전 DB)
        const cFallback = await supabase
          .from("boat_comments")
          .select("bet_id")
          .in("bet_id", pageIds);
        if (!cFallback.error && cFallback.data) {
          for (const r of cFallback.data as { bet_id: string }[]) {
            commentCountById.set(r.bet_id, (commentCountById.get(r.bet_id) ?? 0) + 1);
          }
        }
      }
    }

    const markets = pageRows.map((r) => {
      const row = r as BetRowPublic;
      const pool = poolBy.get(row.id) ?? 0;
      const stakes = stakesByMarket.get(row.id);
      const wire = betRowToFeedWire(row, pool, stakes);
      wire.comments = commentCountById.get(row.id) ?? 0;
      return wire;
    });

    return NextResponse.json(
      { ok: true, markets, hasMore, offset, limit, total: totalSorted },
      { headers: FEED_CACHE_HEADERS },
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
