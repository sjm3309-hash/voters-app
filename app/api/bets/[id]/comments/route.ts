import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { isUuidString } from "@/lib/is-uuid";
import {
  betHistoryMarketCol,
  getBetHistoryFlavor,
} from "@/lib/bet-history-flavor";
import { aggregateStakesByUserFromHistoryRows, stakeHistorySelectColumns } from "@/lib/boat-comment-stakes";
import { isAdminEmail } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

type CommentWire = {
  id: string;
  userId: string;
  author: string;
  content: string;
  createdAt: string;
  isDeleted?: boolean;
};

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: betId } = await context.params;
  const trimmed = betId?.trim() ?? "";
  if (!trimmed || !isUuidString(trimmed)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400, headers: NO_STORE });
  }

  const stakesOnly = new URL(request.url).searchParams.get("stakesOnly") === "1";

  try {
    let svc: ReturnType<typeof createServiceRoleClient>;
    try {
      svc = createServiceRoleClient();
    } catch (envErr) {
      const msg = envErr instanceof Error ? envErr.message : String(envErr);
      return NextResponse.json({ ok: false, error: msg, code: "SERVICE_ROLE_CONFIG" }, { status: 503, headers: NO_STORE });
    }

    const flavor = await getBetHistoryFlavor(svc);
    const marketCol = betHistoryMarketCol(flavor);

    if (stakesOnly) {
      const { data: histRows, error: hErr } = await svc
        .from("bet_history")
        .select(stakeHistorySelectColumns(flavor))
        .eq(marketCol, trimmed);

      if (hErr) {
        return NextResponse.json(
          { ok: false, error: "history_query_failed", details: hErr.message },
          { status: 500, headers: NO_STORE },
        );
      }

      const stakesByUserId = aggregateStakesByUserFromHistoryRows(
        (histRows ?? []) as Record<string, unknown>[],
        flavor,
      );

      return NextResponse.json({ ok: true, stakesByUserId }, { headers: NO_STORE });
    }

    const { data: histRows, error: hErr } = await svc
      .from("bet_history")
      .select(stakeHistorySelectColumns(flavor))
      .eq(marketCol, trimmed);

    if (hErr) {
      return NextResponse.json(
        { ok: false, error: "history_query_failed", details: hErr.message },
        { status: 500, headers: NO_STORE },
      );
    }

    const stakesByUserId = aggregateStakesByUserFromHistoryRows(
      (histRows ?? []) as Record<string, unknown>[],
      flavor,
    );

    const { data: rows, error: cErr } = await svc
      .from("boat_comments")
      .select("id, user_id, author_display, content, created_at, is_deleted")
      .eq("bet_id", trimmed)
      .order("created_at", { ascending: true });

    /** 테이블 미생성·스키마 불일치여도 스테이크 조회는 성공시키고 댓글만 비움 */
    const commentsDbSkipped = Boolean(cErr);

    const comments: CommentWire[] = (commentsDbSkipped ? [] : (rows ?? [])).map((r) => {
      const row = r as {
        id: string;
        user_id: string;
        author_display: string;
        content: string;
        created_at: string;
        is_deleted?: boolean;
      };
      return {
        id: row.id,
        userId: row.user_id,
        author: row.author_display,
        content: row.content,
        createdAt: row.created_at,
        isDeleted: !!row.is_deleted,
      };
    });

    return NextResponse.json(
      {
        ok: true,
        comments,
        stakesByUserId,
        ...(commentsDbSkipped && cErr
          ? {
              warning: "boat_comments_unavailable",
              details: cErr.message,
            }
          : {}),
      },
      { headers: NO_STORE },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: NO_STORE });
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: betId } = await context.params;
  const trimmed = betId?.trim() ?? "";
  if (!trimmed || !isUuidString(trimmed)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400, headers: NO_STORE });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }

  const url = new URL(request.url);
  const commentId = url.searchParams.get("commentId");
  if (!commentId) {
    return NextResponse.json({ ok: false, error: "missing_comment_id" }, { status: 400, headers: NO_STORE });
  }

  const isAdmin = isAdminEmail(user.email);

  try {
    let svc: ReturnType<typeof createServiceRoleClient>;
    try {
      svc = createServiceRoleClient();
    } catch (envErr) {
      const msg = envErr instanceof Error ? envErr.message : String(envErr);
      return NextResponse.json({ ok: false, error: msg, code: "SERVICE_ROLE_CONFIG" }, { status: 503, headers: NO_STORE });
    }

    const query = svc
      .from("boat_comments")
      .update({ is_deleted: true })
      .eq("id", commentId)
      .eq("bet_id", trimmed);

    if (!isAdmin) {
      query.eq("user_id", user.id);
    }

    const { error } = await query;

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500, headers: NO_STORE });
    }

    return NextResponse.json({ ok: true }, { headers: NO_STORE });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: NO_STORE });
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id: betId } = await context.params;
  const trimmed = betId?.trim() ?? "";
  if (!trimmed || !isUuidString(trimmed)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400, headers: NO_STORE });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }

  const body = (await request.json().catch(() => null)) as { content?: string } | null;
  const content = String(body?.content ?? "").trim();
  if (!content) {
    return NextResponse.json({ ok: false, error: "empty_content" }, { status: 400, headers: NO_STORE });
  }

  // user_metadata가 비어 있을 수 있으므로 service-role admin API로 최신 메타데이터 재조회
  let authorDisplay =
    (typeof user.user_metadata?.nickname === "string" && user.user_metadata.nickname.trim()) ||
    (typeof user.user_metadata?.full_name === "string" && user.user_metadata.full_name.trim()) ||
    (typeof user.user_metadata?.name === "string" && user.user_metadata.name.trim()) ||
    user.email?.split("@")[0]?.trim() ||
    "";

  if (!authorDisplay) {
    // 세션 JWT에 메타데이터가 없을 경우 admin API로 재조회
    try {
      const adminSvc = createServiceRoleClient();
      const { data: adminUserData } = await adminSvc.auth.admin.getUserById(user.id);
      if (adminUserData?.user) {
        const m = adminUserData.user.user_metadata ?? {};
        authorDisplay =
          (typeof m.nickname === "string" && m.nickname.trim()) ||
          (typeof m.full_name === "string" && m.full_name.trim()) ||
          (typeof m.name === "string" && m.name.trim()) ||
          adminUserData.user.email?.split("@")[0]?.trim() ||
          adminUserData.user.phone?.slice(-4) ||
          "";
      }
    } catch {
      /* admin lookup 실패해도 계속 진행 */
    }
  }

  if (!authorDisplay) authorDisplay = "익명";

  try {
    let svc: ReturnType<typeof createServiceRoleClient>;
    try {
      svc = createServiceRoleClient();
    } catch (envErr) {
      const msg = envErr instanceof Error ? envErr.message : String(envErr);
      return NextResponse.json({ ok: false, error: msg, code: "SERVICE_ROLE_CONFIG" }, { status: 503, headers: NO_STORE });
    }

    const { data: inserted, error: insErr } = await svc
      .from("boat_comments")
      .insert({
        bet_id: trimmed,
        user_id: user.id,
        author_display: authorDisplay,
        content,
      })
      .select("id, user_id, author_display, content, created_at")
      .maybeSingle();

    if (insErr || !inserted) {
      return NextResponse.json(
        { ok: false, error: "insert_failed", details: insErr?.message },
        { status: 500, headers: NO_STORE },
      );
    }

    const row = inserted as {
      id: string;
      user_id: string;
      author_display: string;
      content: string;
      created_at: string;
    };

    return NextResponse.json(
      {
        ok: true,
        comment: {
          id: row.id,
          userId: row.user_id,
          author: row.author_display,
          content: row.content,
          createdAt: row.created_at,
        } satisfies CommentWire,
      },
      { headers: NO_STORE },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: NO_STORE });
  }
}
