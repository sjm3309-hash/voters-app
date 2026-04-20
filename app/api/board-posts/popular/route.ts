import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import type { BoardCategoryId, BoardPost } from "@/lib/board";

/**
 * GET /api/board-posts/popular
 *
 * board_posts_popular_v View를 조회해 hot_score 내림차순 상위 N개를 반환합니다.
 *
 * 쿼리 파라미터:
 *   limit    - 반환 개수 (기본 20, 최대 50)
 *   category - 카테고리 필터 (선택)
 */
export const revalidate = 30; // 30초 캐시

const LIMIT_DEFAULT = 20;
const LIMIT_MAX = 50;

const ALLOWED_CATEGORY = new Set<BoardCategoryId>([
  "sports", "fun", "stocks", "crypto", "politics", "game", "poljjak",
]);

type PopularViewRow = {
  id?: string;
  title?: string;
  content?: string;
  content_html?: string | null;
  category?: string;
  sub_category?: string | null;
  author_name?: string;
  author_id?: string | null;
  thumbnail_url?: string | null;
  images?: unknown;
  views?: number;
  comment_count?: number;
  is_hot?: boolean;
  created_at?: string;
  updated_at?: string;
  hot_score?: number;
};

function rowToPost(row: PopularViewRow): BoardPost & { hotScore: number } {
  const images = row.images;
  const imagesArr = Array.isArray(images)
    ? (images as unknown[]).filter((x): x is string => typeof x === "string")
    : undefined;

  return {
    id: String(row.id ?? ""),
    title: String(row.title ?? ""),
    content: String(row.content ?? ""),
    contentHtml:
      typeof row.content_html === "string" && row.content_html.length > 0
        ? row.content_html
        : undefined,
    category: (row.category ?? "fun") as BoardCategoryId,
    subCategory: typeof row.sub_category === "string" ? row.sub_category : undefined,
    thumbnail: typeof row.thumbnail_url === "string" ? row.thumbnail_url : undefined,
    images: imagesArr && imagesArr.length > 0 ? imagesArr : undefined,
    commentCount: typeof row.comment_count === "number" ? row.comment_count : 0,
    views: typeof row.views === "number" ? row.views : 0,
    author: String(row.author_name ?? "익명"),
    authorId: typeof row.author_id === "string" ? row.author_id : undefined,
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
    isHot: Boolean(row.is_hot),
    hotScore: typeof row.hot_score === "number" ? row.hot_score : 0,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);

    const limitRaw = parseInt(url.searchParams.get("limit") ?? String(LIMIT_DEFAULT), 10);
    const limit =
      Number.isFinite(limitRaw) && limitRaw >= 1 && limitRaw <= LIMIT_MAX
        ? limitRaw
        : LIMIT_DEFAULT;

    const categoryRaw = url.searchParams.get("category");
    const category =
      categoryRaw && ALLOWED_CATEGORY.has(categoryRaw as BoardCategoryId)
        ? (categoryRaw as BoardCategoryId)
        : null;

    const svc = createServiceRoleClient();

    let query = svc
      .from("board_posts_popular_v")
      .select("*")
      .order("hot_score", { ascending: false })
      .limit(limit);

    if (category) {
      query = query.eq("category", category);
    }

    const { data, error } = await query;

    if (error) {
      console.error("[board-posts/popular GET]", error.message);
      return NextResponse.json(
        { ok: false, error: "query_failed", message: error.message },
        { status: 500 },
      );
    }

    const posts = ((data ?? []) as PopularViewRow[]).map(rowToPost);

    return NextResponse.json({ ok: true, posts });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
