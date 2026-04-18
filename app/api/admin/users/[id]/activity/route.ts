import { NextResponse } from "next/server";
import { requireAdminJson } from "@/app/api/admin/_auth";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

/**
 * GET /api/admin/users/[id]/activity
 * 특정 유저의 활동 전체 (게시글·댓글·보트댓글·생성보트)를 DB에서 조회합니다.
 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminJson();
  if (!auth.ok) return auth.response;

  const { id: userId } = await context.params;
  if (!userId?.trim()) {
    return NextResponse.json({ ok: false, error: "missing user id" }, { status: 400 });
  }

  try {
    const svc = createServiceRoleClient();

    const [postsRes, boardCommentsRes, boatCommentsRes, betsRes] = await Promise.all([
      // 작성 게시글
      svc
        .from("board_posts")
        .select("id, title, category, created_at")
        .eq("author_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),

      // 게시판 댓글 (삭제되지 않은 것만)
      svc
        .from("post_comments")
        .select("id, post_id, content, created_at, board_posts(title)")
        .eq("author_id", userId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(50),

      // 보트 댓글 (삭제되지 않은 것만)
      svc
        .from("boat_comments")
        .select("id, bet_id, content, created_at, bets(title)")
        .eq("user_id", userId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(50),

      // 유저가 만든 보트
      svc
        .from("bets")
        .select("id, title, category, status, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

    const posts = (postsRes.data ?? []).map((r) => ({
      id: String(r.id),
      title: String(r.title ?? ""),
      category: String(r.category ?? ""),
      createdAt: String(r.created_at ?? ""),
    }));

    const boardComments = (boardCommentsRes.data ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      const postData = row.board_posts as Record<string, unknown> | null;
      return {
        id: String(row.id),
        postId: String(row.post_id ?? ""),
        postTitle: postData ? String(postData.title ?? "") : "",
        content: String(row.content ?? ""),
        createdAt: String(row.created_at ?? ""),
      };
    });

    const boatComments = (boatCommentsRes.data ?? []).map((r) => {
      const row = r as Record<string, unknown>;
      const betData = row.bets as Record<string, unknown> | null;
      return {
        id: String(row.id),
        betId: String(row.bet_id ?? ""),
        betTitle: betData ? String(betData.title ?? "") : "",
        content: String(row.content ?? ""),
        createdAt: String(row.created_at ?? ""),
      };
    });

    const bets = (betsRes.data ?? []).map((r) => ({
      id: String(r.id),
      title: String(r.title ?? ""),
      category: String(r.category ?? ""),
      status: String(r.status ?? ""),
      createdAt: String(r.created_at ?? ""),
    }));

    return NextResponse.json({
      ok: true,
      userId,
      posts,
      boardComments,
      boatComments,
      bets,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
