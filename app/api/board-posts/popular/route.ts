import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import type { BoardCategoryId, BoardPost } from "@/lib/board";

/**
 * GET /api/board-posts/popular
 *
 * board_posts 테이블에서 hot_score를 서버에서 계산해 상위 N개를 반환합니다.
 * hot_score = (views + comment_count * 5) / (경과시간(h) + 2)^1.5
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

/** hot_score 계산: (views + 댓글수×5) / (경과시간h + 2)^1.5 */
function calcHotScore(row: PopularViewRow): number {
  const views = typeof row.views === "number" ? row.views : 0;
  const comments = typeof row.comment_count === "number" ? row.comment_count : 0;
  const createdAt = typeof row.created_at === "string" ? row.created_at : new Date().toISOString();
  const ageHours = (Date.now() - Date.parse(createdAt)) / 3_600_000;
  return (views + comments * 5) / Math.pow(Math.max(0, ageHours) + 2, 1.5);
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

    // ── 1. 전체 글 가져오기 (점수 계산을 위해 충분히 확보) ────────────────────
    // images(JSONB), content_html 은 목록에서 불필요하므로 제외해 페이로드 축소
    const LIST_COLUMNS = [
      "id", "title", "content", "category", "sub_category",
      "author_name", "author_id", "thumbnail_url",
      "views", "comment_count", "is_hot", "created_at", "updated_at",
    ].join(", ");

    let allQuery = svc
      .from("board_posts")
      .select(LIST_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(200); // 최대 200개 중 점수 상위 N개 선정

    if (category) allQuery = allQuery.eq("category", category);

    const { data: allData, error: allError } = await allQuery;

    if (allError) {
      console.error("[board-posts/popular GET]", allError.message);
      return NextResponse.json(
        { ok: false, error: "query_failed", message: allError.message },
        { status: 500 },
      );
    }

    const rows = (allData ?? []) as PopularViewRow[];

    // ── 2. 점수 계산 후 내림차순 정렬 ────────────────────────────────────────
    const scored = rows
      .map((r) => ({ row: r, score: calcHotScore(r) }))
      .sort((a, b) => b.score - a.score);

    // ── 3. 인기글(상위 점수) 선정 ────────────────────────────────────────────
    const popularPosts = scored.slice(0, limit).map(({ row }) => rowToPost(row));

    // ── 4. 부족분을 최신글로 채우기 (중복 제외) ───────────────────────────────
    const remaining = limit - popularPosts.length;

    if (remaining > 0) {
      const popularIds = new Set(popularPosts.map((p) => p.id));

      // scored 배열은 이미 가져온 글이므로 여기서 최신순으로 재정렬해 채움
      const recentFill = rows
        .filter((r) => !popularIds.has(String(r.id ?? "")))
        .sort((a, b) =>
          Date.parse(b.created_at ?? "") - Date.parse(a.created_at ?? ""),
        )
        .slice(0, remaining)
        .map(rowToPost);

      return NextResponse.json({ ok: true, posts: [...popularPosts, ...recentFill] });
    }

    return NextResponse.json({ ok: true, posts: popularPosts });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
