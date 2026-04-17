import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import {
  betRowToMarket,
  type BetRowPublic,
} from "@/lib/bets-market-mapper";
import {
  sortBetFeedRows,
  type SmartSortMode,
} from "@/lib/bets-feed-sort";

/**
 * 메인 그리드용 — 동기화 보트 목록 (스마트 정렬)
 *
 * 쿼리 (DB 값과 띄어쓰기·대소문자 일치):
 * - `?category=게임` — 게임만
 * - `?category=게임&sub_category=LoL` — 게임·LoL 탭과 동일
 * - `?category=스포츠&sub_category=해외축구` — 해외축구
 * - `?sort=created_desc` — 상태 구간(active→waiting→closed) 유지 후, 구간 내 생성일 최신순
 *
 * `confirmed_at` 필터: 미종료(null)는 항상 포함, 값이 있으면 현재 시각 기준 3일 이내(≥ 3일 전 시각)만 포함.
 */
const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const FETCH_CAP = 400;
const RESPONSE_LIMIT = 100;

export async function GET(request: Request) {
  try {
    const nowMs = Date.now();

    /**
     * (임시 모크 분기)
     * - 로컬 모크 테스트를 위해 사용하던 분기입니다.
     * - 실제 데이터 재활성화 요청에 따라 현재는 비활성(주석) 상태로 보관합니다.
     *
     * if (useMockPredictionData()) {
     *   ...
     * }
     */

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
        { status: 503 },
      );
    }
    const threeDaysAgoISO = new Date(nowMs - THREE_DAYS_MS).toISOString();
    const { searchParams } = new URL(request.url);
    const category = searchParams.get("category")?.trim();
    const subCategory = searchParams.get("sub_category")?.trim();
    const sort = searchParams.get("sort")?.trim();

    let q = supabase
      .from("bets")
      .select(
        "id, title, closing_at, confirmed_at, created_at, category, sub_category, color, status, is_admin_generated, author_name, options",
      )
      .or(
        `confirmed_at.is.null,confirmed_at.gte."${threeDaysAgoISO}"`,
      );

    if (category) {
      q = q.eq("category", category);
    }
    if (subCategory) {
      q = q.eq("sub_category", subCategory);
    }

    const { data, error } = await q
      .order("created_at", { ascending: false })
      .limit(FETCH_CAP);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code },
        { status: 500 },
      );
    }

    const rawRows = (data ?? []) as BetRowPublic[];
    const ids = rawRows.map((r) => r.id).filter(Boolean);
    console.log("[bets-feed]", {
      fetched: rawRows.length,
      hasCategoryFilter: Boolean(category),
      hasSubCategoryFilter: Boolean(subCategory),
      sort: sort ?? "smart",
    });

    const poolBy = new Map<string, number>();
    /** `.in()`에 빈 배열을 넣으면 PostgREST 오류가 날 수 있음 */
    if (ids.length > 0) {
      const { data: hist, error: hErr } = await supabase
        .from("bet_history")
        .select("market_id, amount")
        .in("market_id", ids);
      if (!hErr && hist) {
        for (const h of hist as { market_id: string; amount: number }[]) {
          const mid = h.market_id;
          poolBy.set(mid, (poolBy.get(mid) ?? 0) + (h.amount ?? 0));
        }
      }
    }

    const sortMode: SmartSortMode =
      sort === "created_desc" ? "created_desc" : "smart";
    const rows = sortBetFeedRows(rawRows, nowMs, poolBy, sortMode).slice(
      0,
      RESPONSE_LIMIT,
    );

    const markets = rows.map((r) => {
      const m = betRowToMarket(r);
      const row = r as BetRowPublic;
      const createdAt =
        row.created_at && String(row.created_at).trim()
          ? new Date(row.created_at).toISOString()
          : undefined;
      return {
        id: m.id,
        question: m.question,
        category: m.category,
        subCategory: m.subCategory,
          subCategoryLabel: (r.sub_category ?? "").trim() || undefined,
        options: m.options,
        totalPool: m.totalPool,
        comments: m.comments,
        endsAt: m.endsAt.toISOString(),
        createdAt,
        resultAt: m.resultAt?.toISOString(),
        accentColor: m.accentColor,
        isOfficial: m.isOfficial,
        officialAuthorName: m.officialAuthorName,
      };
    });

    return NextResponse.json({ ok: true, markets });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: message },
      { status: 500 },
    );
  }
}
