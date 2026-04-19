import { NextResponse } from "next/server";
import { requireAdminJson } from "@/app/api/admin/_auth";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import type { ReportTargetType } from "@/lib/reports-config";

export interface ReportedContent {
  targetType: ReportTargetType;
  targetId: string;
  /** 화면에 표시할 제목 또는 본문 요약 */
  title: string | null;
  /** 본문 전체 (댓글/게시글 내용) */
  body: string | null;
  /** 작성자 표시명 */
  author: string | null;
  /** 상위 항목 링크용 ID (댓글의 경우 보트/게시글 ID) */
  parentId: string | null;
  /** 원본으로 이동할 URL */
  link: string | null;
}

/**
 * GET /api/admin/reports/content?targetType=...&targetId=...
 * 신고 대상 항목의 실제 내용을 조회합니다.
 */
export async function GET(request: Request) {
  const auth = await requireAdminJson();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const targetType = url.searchParams.get("targetType") as ReportTargetType | null;
  const targetId = url.searchParams.get("targetId");

  if (!targetType || !targetId) {
    return NextResponse.json({ ok: false, error: "missing_params" }, { status: 400 });
  }

  const svc = createServiceRoleClient();

  try {
    let content: ReportedContent = {
      targetType,
      targetId,
      title: null,
      body: null,
      author: null,
      parentId: null,
      link: null,
    };

    if (targetType === "boat") {
      const { data } = await svc
        .from("bets")
        .select("id, question, category, author_name, author_id")
        .eq("id", targetId)
        .maybeSingle();

      if (data) {
        const row = data as Record<string, unknown>;
        content = {
          ...content,
          title: String(row.question ?? ""),
          body: null,
          author: String(row.author_name ?? ""),
          parentId: null,
          link: `/market/${targetId}`,
        };
      }
    } else if (targetType === "boat_comment") {
      const { data } = await svc
        .from("boat_comments")
        .select("id, bet_id, author_display, content, user_id")
        .eq("id", targetId)
        .maybeSingle();

      if (data) {
        const row = data as Record<string, unknown>;
        const betId = String(row.bet_id ?? "");
        content = {
          ...content,
          title: null,
          body: String(row.content ?? ""),
          author: String(row.author_display ?? ""),
          parentId: betId,
          link: betId ? `/market/${betId}` : null,
        };
      }
    } else if (targetType === "board_post") {
      const { data } = await svc
        .from("board_posts")
        .select("id, title, content, author_name, author_id")
        .eq("id", targetId)
        .maybeSingle();

      if (data) {
        const row = data as Record<string, unknown>;
        content = {
          ...content,
          title: String(row.title ?? ""),
          body: String(row.content ?? "").slice(0, 300),
          author: String(row.author_name ?? ""),
          parentId: null,
          link: `/board/${targetId}`,
        };
      }
    } else if (targetType === "board_comment") {
      const { data } = await svc
        .from("post_comments")
        .select("id, post_id, author_display, content")
        .eq("id", targetId)
        .maybeSingle();

      if (data) {
        const row = data as Record<string, unknown>;
        const postId = String(row.post_id ?? "");
        content = {
          ...content,
          title: null,
          body: String(row.content ?? ""),
          author: String(row.author_display ?? ""),
          parentId: postId,
          link: postId ? `/board/${postId}` : null,
        };
      }
    }

    return NextResponse.json({ ok: true, content });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
