import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { checkUserModeration } from "@/lib/moderation-check";
import { isAdminEmail } from "@/lib/admin";

export type PostComment = {
  id: string;
  postId: string;
  parentId: string | null;   // 대댓글용 부모 댓글 ID
  authorId: string | null;
  authorDisplay: string;
  content: string;
  createdAt: string;
  isDeleted?: boolean;
  replies?: PostComment[];   // 클라이언트 전용 — 대댓글 목록
};

function rowToComment(row: Record<string, unknown>): PostComment {
  return {
    id: String(row.id),
    postId: String(row.post_id),
    parentId: typeof row.parent_id === "string" ? row.parent_id : null,
    authorId: typeof row.author_id === "string" ? row.author_id : null,
    authorDisplay: String(row.author_display ?? "익명"),
    content: String(row.content),
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
    isDeleted: !!row.is_deleted,
  };
}

// ─── GET: 특정 게시글의 댓글 목록 (트리 구조로 반환) ─────────────────────────
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const postId = url.searchParams.get("postId");

    if (!postId) {
      return NextResponse.json(
        { ok: false, error: "missing_post_id", message: "postId가 필요합니다." },
        { status: 400 },
      );
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("post_comments")
      .select("*")
      .eq("post_id", postId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[post-comments GET]", error);
      return NextResponse.json(
        { ok: false, error: "query_failed", message: error.message },
        { status: 500 },
      );
    }

    const flat = (Array.isArray(data) ? data : []).map((r) =>
      rowToComment(r as Record<string, unknown>),
    );

    // 평탄 목록을 트리로 변환 (최대 1단계 대댓글)
    const roots: PostComment[] = [];
    const byId = new Map<string, PostComment>();
    for (const c of flat) byId.set(c.id, { ...c, replies: [] });
    for (const c of byId.values()) {
      if (c.parentId && byId.has(c.parentId)) {
        byId.get(c.parentId)!.replies!.push(c);
      } else {
        roots.push(c);
      }
    }

    return NextResponse.json({ ok: true, comments: roots });
  } catch (e) {
    console.error("[post-comments GET]", e);
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }
}

// ─── POST: 댓글 / 대댓글 작성 ────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();

    if (!user?.id) {
      return NextResponse.json(
        { ok: false, error: "unauthorized", message: "로그인이 필요합니다." },
        { status: 401 },
      );
    }

    let body: unknown;
    try { body = await request.json(); } catch {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    const o = body as Record<string, unknown>;
    const postId   = typeof o.postId   === "string" ? o.postId : null;
    const content  = typeof o.content  === "string" ? o.content.trim() : null;
    const parentId = typeof o.parentId === "string" && o.parentId.trim() ? o.parentId.trim() : null;

    if (!postId || !content) {
      return NextResponse.json(
        { ok: false, error: "validation_failed", message: "postId와 content는 필수입니다." },
        { status: 400 },
      );
    }

    const mod = await checkUserModeration(user.id);
    if (mod.blocked) {
      return NextResponse.json({ ok: false, error: mod.reason, message: mod.message }, { status: 403 });
    }

    const authorDisplay =
      user.user_metadata?.nickname ??
      user.user_metadata?.full_name ??
      user.user_metadata?.name ??
      user.email?.split("@")[0] ??
      "익명";

    const supabase = createServiceRoleClient();

    const insertRow: Record<string, unknown> = {
      post_id: postId,
      author_id: user.id,
      author_display: authorDisplay,
      content,
      created_at: new Date().toISOString(),
    };
    if (parentId) insertRow.parent_id = parentId;

    const { data: inserted, error } = await supabase
      .from("post_comments")
      .insert(insertRow)
      .select("*")
      .single();

    if (error) {
      console.error("[post-comments POST]", error);
      return NextResponse.json(
        { ok: false, error: "insert_failed", message: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      comment: rowToComment(inserted as Record<string, unknown>),
    });
  } catch (e) {
    console.error("[post-comments POST]", e);
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }
}

// ─── DELETE: 댓글 소프트 삭제 (본인 또는 운영자) ────────────────────────────
export async function DELETE(request: Request) {
  try {
    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const commentId = url.searchParams.get("id");
    if (!commentId) {
      return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
    }

    const isAdmin = isAdminEmail(user.email);
    const supabase = createServiceRoleClient();

    // 본인 또는 운영자만 삭제 가능
    const query = supabase
      .from("post_comments")
      .update({ is_deleted: true })
      .eq("id", commentId);

    if (!isAdmin) {
      query.eq("author_id", user.id);
    }

    const { error } = await query;

    if (error) {
      console.error("[post-comments DELETE]", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[post-comments DELETE]", e);
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }
}
