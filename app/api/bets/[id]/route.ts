import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import type { BetRowPublic } from "@/lib/bets-market-mapper";
import { betRowToFeedWire } from "@/lib/bets-feed-wire";
import { isUuidString } from "@/lib/is-uuid";
import {
  betHistoryMarketCol,
  betHistoryOptionCol,
  getBetHistoryFlavor,
  readOptionIdFromRow,
} from "@/lib/bet-history-flavor";

/** 보트 상세 JSON — 항상 최신 DB 반영 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  if (!isUuidString(id)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400 });
  }

  const authSupabase = await createClient();
  const { data: { user } } = await authSupabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const svc = createServiceRoleClient();

  // 보트 존재 + 창작자 확인
  const { data: bet, error: betErr } = await svc
    .from("bets")
    .select("id, creator_user_id, status")
    .eq("id", id)
    .maybeSingle();

  if (betErr || !bet) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }
  if (bet.creator_user_id !== user.id) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }
  if (!["waiting", "active"].includes(bet.status ?? "")) {
    return NextResponse.json({ ok: false, error: "already_closed" }, { status: 400 });
  }

  // 참여자 수 확인 (베팅 기록이 있으면 수정 불가)
  const { count: betCount } = await svc
    .from("bet_history")
    .select("id", { count: "exact", head: true })
    .eq("bet_id", id);

  if ((betCount ?? 0) > 0) {
    return NextResponse.json({ ok: false, error: "already_has_bets" }, { status: 400 });
  }

  const body = await request.json().catch(() => ({}));
  const { question, description, endsAt, resultAt, options, resolver } = body as {
    question?: string;
    description?: string;
    endsAt?: string;
    resultAt?: string;
    options?: { label: string; color: string }[];
    resolver?: string;
  };

  if (!question?.trim()) {
    return NextResponse.json({ ok: false, error: "질문을 입력해주세요." }, { status: 400 });
  }
  if (!options || options.filter((o) => o.label.trim()).length < 2) {
    return NextResponse.json({ ok: false, error: "선택지는 2개 이상이어야 합니다." }, { status: 400 });
  }
  if (!endsAt) {
    return NextResponse.json({ ok: false, error: "마감 일시를 입력해주세요." }, { status: 400 });
  }

  const { error: updateErr } = await svc
    .from("bets")
    .update({
      question: question.trim(),
      description: description?.trim() ?? null,
      ends_at: endsAt,
      result_at: resultAt ?? null,
      options: options.filter((o) => o.label.trim()),
      resolver: resolver?.trim() ?? null,
    })
    .eq("id", id);

  if (updateErr) {
    return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const trimmed = id?.trim() ?? "";
  if (!trimmed) {
    return NextResponse.json(
      { ok: false, error: "missing id" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  if (!isUuidString(trimmed)) {
    return NextResponse.json(
      { ok: false, error: "invalid_id" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    let supabase: ReturnType<typeof createServiceRoleClient>;
    try {
      supabase = createServiceRoleClient();
    } catch (envErr) {
      const msg = envErr instanceof Error ? envErr.message : String(envErr);
      return NextResponse.json(
        { ok: false, error: msg, code: "SERVICE_ROLE_CONFIG" },
        { status: 503, headers: NO_STORE_HEADERS },
      );
    }

    // `*` 사용: Supabase에 winning_option_id 등 마이그레이션 전 DB도 조회 가능
    const { data, error } = await supabase
      .from("bets")
      .select("*")
      .eq("id", trimmed)
      .maybeSingle();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code },
        { status: 500, headers: NO_STORE_HEADERS },
      );
    }
    if (!data) {
      return NextResponse.json(
        { ok: false, error: "not_found" },
        { status: 404, headers: NO_STORE_HEADERS },
      );
    }

    const row = data as BetRowPublic;
    const flavor = await getBetHistoryFlavor(supabase);
    const marketCol = betHistoryMarketCol(flavor);
    const optionCol = betHistoryOptionCol(flavor);

    const { data: histRows } = await supabase
      .from("bet_history")
      .select(`${optionCol}, amount, user_id`)
      .eq(marketCol, trimmed);

    let pool = 0;
    const optionTotals: Record<string, number> = {};
    const participantSet = new Set<string>();
    let sessionUser: { id: string } | null = null;
    try {
      const authSupabase = await createClient();
      const {
        data: { user },
      } = await authSupabase.auth.getUser();
      sessionUser = user?.id ? { id: user.id } : null;
    } catch {
      /* 쿠키/anon 설정 문제여도 보트 본문은 반환 */
    }
    const myOptionTotals: Record<string, number> = {};

    for (const h of histRows ?? []) {
      const r = h as Record<string, unknown>;
      const a = Math.floor(Number(r.amount ?? 0));
      if (!Number.isFinite(a) || a <= 0) continue;
      pool += a;
      const oid = readOptionIdFromRow(flavor, r);
      if (oid) {
        optionTotals[oid] = (optionTotals[oid] ?? 0) + a;
      }
      const uid = String(r.user_id ?? "").trim();
      if (uid) participantSet.add(uid);
      if (sessionUser?.id && uid === sessionUser.id && oid) {
        myOptionTotals[oid] = (myOptionTotals[oid] ?? 0) + a;
      }
    }

    // 실제 댓글 수 집계 (is_deleted 컬럼 없는 DB도 처리)
    let commentCount = 0;
    const cResult = await supabase
      .from("boat_comments")
      .select("id")
      .eq("bet_id", trimmed)
      .eq("is_deleted", false);
    if (!cResult.error && cResult.data) {
      commentCount = cResult.data.length;
    } else {
      // is_deleted 컬럼 없는 경우 fallback (마이그레이션 전 DB)
      const cFallback = await supabase
        .from("boat_comments")
        .select("id")
        .eq("bet_id", trimmed);
      if (!cFallback.error && cFallback.data) {
        commentCount = cFallback.data.length;
      }
    }

    const market = betRowToFeedWire(row, pool, optionTotals);
    market.comments = commentCount;
    market.participants = participantSet.size;
    return NextResponse.json(
      { ok: true, market, optionTotals, myOptionTotals },
      { headers: NO_STORE_HEADERS },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: msg },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
