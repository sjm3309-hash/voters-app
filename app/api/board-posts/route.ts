import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import type { BoardCategoryId, BoardPost } from "@/lib/board";
import { checkUserModeration } from "@/lib/moderation-check";

const LIMIT_DEFAULT = 20;

const ALLOWED_CATEGORY = new Set<BoardCategoryId>([
  "sports",
  "fun",
  "stocks",
  "crypto",
  "politics",
  "game",
]);

function parsePage(raw: string | null): number {
  const n = parseInt(raw ?? "1", 10);
  if (!Number.isFinite(n) || n < 1) return 1;
  return n;
}

function rowToBoardPost(row: Record<string, unknown>): BoardPost {
  const images = row.images;
  let imagesArr: string[] | undefined;
  if (Array.isArray(images)) {
    imagesArr = images.filter((x): x is string => typeof x === "string");
    if (imagesArr.length === 0) imagesArr = undefined;
  }
  const thumb = typeof row.thumbnail_url === "string" ? row.thumbnail_url : undefined;
  return {
    id: String(row.id),
    title: String(row.title),
    content: String(row.content),
    contentHtml:
      typeof row.content_html === "string" && row.content_html.length > 0
        ? row.content_html
        : undefined,
    category: row.category as BoardCategoryId,
    subCategory: typeof row.sub_category === "string" ? row.sub_category : undefined,
    thumbnail: thumb || undefined,
    images: imagesArr,
    commentCount: typeof row.comment_count === "number" ? row.comment_count : 0,
    views: typeof row.views === "number" ? row.views : 0,
    author: String(row.author_name ?? "익명"),
    authorId: typeof row.author_id === "string" ? row.author_id : undefined,
    createdAt:
      typeof row.created_at === "string"
        ? row.created_at
        : new Date().toISOString(),
    isHot: Boolean(row.is_hot),
  };
}

// ─── GET (목록 or 단일) ─────────────────────────────────────────────────────
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const singleId = url.searchParams.get("id");

    const supabase = createServiceRoleClient();

    // 단일 게시글 조회
    if (singleId) {
      const { data, error } = await supabase
        .from("board_posts")
        .select("*")
        .eq("id", singleId)
        .single();

      if (error || !data) {
        return NextResponse.json(
          { ok: false, error: "not_found", message: "게시글을 찾을 수 없습니다." },
          { status: 404 },
        );
      }

      // 조회수 증가 (fire-and-forget)
      supabase
        .from("board_posts")
        .update({ views: (data.views ?? 0) + 1 })
        .eq("id", singleId)
        .then(() => {});

      return NextResponse.json({ ok: true, post: rowToBoardPost(data as Record<string, unknown>) });
    }

    // 목록 조회
    const page = parsePage(url.searchParams.get("page"));
    const limitRaw = parseInt(url.searchParams.get("limit") ?? String(LIMIT_DEFAULT), 10);
    const limit =
      Number.isFinite(limitRaw) && limitRaw >= 1 && limitRaw <= 100 ? limitRaw : LIMIT_DEFAULT;
    const sort = url.searchParams.get("sort") === "hot" ? "hot" : "recent";
    const categoryRaw = url.searchParams.get("category");
    const category =
      categoryRaw && ALLOWED_CATEGORY.has(categoryRaw as BoardCategoryId)
        ? (categoryRaw as BoardCategoryId)
        : null;
    const q = (url.searchParams.get("q") ?? "").trim();
    const authorId = (url.searchParams.get("authorId") ?? "").trim();

    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabase.from("board_posts").select("*", { count: "exact", head: false });

    if (authorId) {
      query = query.eq("author_id", authorId);
    }

    if (category) {
      query = query.eq("category", category);
    }

    if (q.length > 0) {
      const escaped = q.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
      query = query.or(`title.ilike.%${escaped}%,content.ilike.%${escaped}%`);
    }

    if (sort === "hot") {
      query = query
        .order("views", { ascending: false })
        .order("comment_count", { ascending: false })
        .order("created_at", { ascending: false });
    } else {
      query = query.order("created_at", { ascending: false });
    }

    const { data, error, count } = await query.range(from, to);

    if (error) {
      console.error("[board-posts GET]", error);
      return NextResponse.json(
        { ok: false, error: "query_failed", message: error.message },
        { status: 500 },
      );
    }

    const total =
      typeof count === "number" && Number.isFinite(count) ? Math.max(0, count) : 0;
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    const rows = Array.isArray(data) ? data : [];
    const posts = rows.map((r) => rowToBoardPost(r as Record<string, unknown>));

    return NextResponse.json({
      ok: true,
      posts,
      page,
      limit,
      count: total,
      totalPages,
    });
  } catch (e) {
    console.error("[board-posts GET]", e);
    return NextResponse.json(
      { ok: false, error: "internal", message: "서버 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

// ─── POST (게시글 작성) ──────────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const auth = await createClient();
    const {
      data: { user },
    } = await auth.auth.getUser();

    if (!user?.id) {
      return NextResponse.json(
        { ok: false, error: "unauthorized", message: "로그인이 필요합니다." },
        { status: 401 },
      );
    }

    let rawJson: unknown;
    try {
      rawJson = await request.json();
    } catch {
      return NextResponse.json(
        { ok: false, error: "invalid_json", message: "요청 본문이 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const body =
      typeof rawJson === "object" && rawJson !== null && "post" in rawJson
        ? (rawJson as { post: unknown }).post
        : rawJson;

    if (typeof body !== "object" || body === null) {
      return NextResponse.json(
        { ok: false, error: "validation_failed", message: "게시글 형식이 올바르지 않습니다." },
        { status: 400 },
      );
    }

    const o = body as Record<string, unknown>;
    const title = typeof o.title === "string" && o.title.trim().length > 0 ? o.title.trim() : null;
    const content = typeof o.content === "string" && o.content.trim().length > 0 ? o.content.trim() : null;
    const category = typeof o.category === "string" ? o.category : null;

    if (!title || !content || !category) {
      return NextResponse.json(
        { ok: false, error: "validation_failed", message: "제목, 내용, 카테고리는 필수입니다." },
        { status: 400 },
      );
    }
    if (!ALLOWED_CATEGORY.has(category as BoardCategoryId)) {
      return NextResponse.json(
        { ok: false, error: "invalid_category", message: "유효하지 않은 카테고리입니다." },
        { status: 400 },
      );
    }

    const mod = await checkUserModeration(user.id);
    if (mod.blocked) {
      return NextResponse.json({ ok: false, error: mod.reason, message: mod.message }, { status: 403 });
    }

    const authorName =
      user.user_metadata?.nickname ??
      user.user_metadata?.full_name ??
      user.user_metadata?.name ??
      user.email?.split("@")[0] ??
      "익명";

    const supabase = createServiceRoleClient();

    const subCategoryRaw =
      typeof o.subCategory === "string" && o.subCategory.trim().length > 0
        ? o.subCategory.trim()
        : null;

    const row: Record<string, unknown> = {
      title,
      content,
      content_html: typeof o.contentHtml === "string" ? o.contentHtml : null,
      category,
      author_id: user.id,
      author_name: authorName,
      thumbnail_url: typeof o.thumbnail === "string" ? o.thumbnail : null,
      images: Array.isArray(o.images) ? o.images : [],
      views: 0,
      comment_count: 0,
      is_hot: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    // sub_category 컬럼은 값이 있을 때만 포함 (컬럼이 없는 환경에서도 안전하게 동작)
    if (subCategoryRaw) {
      row.sub_category = subCategoryRaw;
    }

    const { data: inserted, error } = await supabase
      .from("board_posts")
      .insert(row)
      .select("id")
      .single();

    if (error) {
      console.error("[board-posts POST]", error);
      return NextResponse.json(
        { ok: false, error: "insert_failed", message: error.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, id: inserted?.id });
  } catch (e) {
    console.error("[board-posts POST]", e);
    return NextResponse.json(
      { ok: false, error: "internal", message: "서버 오류가 발생했습니다." },
      { status: 500 },
    );
  }
}

// ─── PATCH (게시글 수정) ─────────────────────────────────────────────────────
export async function PATCH(request: Request) {
  try {
    const auth = await createClient();
    const {
      data: { user },
    } = await auth.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const postId = url.searchParams.get("id");
    if (!postId) {
      return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    const o = body as Record<string, unknown>;
    const updates: Record<string, unknown> = {};
    if (typeof o.title === "string" && o.title.trim()) updates.title = o.title.trim();
    if (typeof o.content === "string" && o.content.trim()) updates.content = o.content.trim();
    if (typeof o.contentHtml === "string") updates.content_html = o.contentHtml;
    updates.updated_at = new Date().toISOString();

    const supabase = createServiceRoleClient();

    // RLS: 본인 글만 수정 가능
    const { error } = await supabase
      .from("board_posts")
      .update(updates)
      .eq("id", postId)
      .eq("author_id", user.id);

    if (error) {
      console.error("[board-posts PATCH]", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[board-posts PATCH]", e);
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }
}

// ─── DELETE (게시글 삭제) ────────────────────────────────────────────────────
export async function DELETE(request: Request) {
  try {
    const auth = await createClient();
    const {
      data: { user },
    } = await auth.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const postId = url.searchParams.get("id");
    if (!postId) {
      return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    const { error } = await supabase
      .from("board_posts")
      .delete()
      .eq("id", postId)
      .eq("author_id", user.id);

    if (error) {
      console.error("[board-posts DELETE]", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[board-posts DELETE]", e);
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }
}
