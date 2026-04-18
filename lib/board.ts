import type { CategoryId, FilterId } from "@/components/category-filter";

export type BoardCategoryId = Exclude<CategoryId, "all">;

export type BoardPost = {
  id: string;
  title: string;
  content: string; // plain text (search-friendly)
  contentHtml?: string; // rich text (render)
  category: BoardCategoryId;
  subCategory?: string; // 세부 카테고리 id (lib/subcategories.ts 참조)
  thumbnail?: string;
  images?: string[]; // data URLs (local-only)
  commentCount: number;
  views?: number;    // 조회수
  author: string;
  authorId?: string; // Supabase auth user id
  createdAt: string; // ISO
  isHot?: boolean;
};

const STORAGE_KEY = "voters.board.posts";

// UUID 형식 여부 확인 (실제 유저 글은 UUID ID를 가짐)
function isUuidLike(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

export function loadBoardPosts(): BoardPost[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BoardPost[];
    if (!Array.isArray(parsed)) return [];

    // mock 데이터 제거: UUID 형식이 아닌 ID(예: "1", "2", "5b")는 mock 데이터
    const realOnly = parsed.filter((p) => isUuidLike(p.id));

    // 실제 글이 없으면 localStorage 자체를 초기화
    if (realOnly.length === 0) {
      window.localStorage.removeItem(STORAGE_KEY);
      return [];
    }

    // migrate legacy categories
    const migrated = realOnly.map((p) => {
      const cat = (p as any).category;
      if (cat === "community") return { ...p, category: "fun" } as BoardPost;
      if (cat === "suggest") return { ...p, category: "fun" } as BoardPost;
      return p;
    });
    if (migrated.length !== parsed.length || migrated.some((p, i) => p !== realOnly[i])) {
      saveBoardPosts(migrated);
    }
    return migrated;
  } catch {
    return [];
  }
}

export function saveBoardPosts(posts: BoardPost[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
  window.dispatchEvent(new Event("voters:postsUpdated"));
}

/** 게시글 조회수를 1 증가시키고 저장합니다. */
export function incrementPostViews(postId: string): void {
  if (typeof window === "undefined") return;
  const posts = loadBoardPosts();
  const idx = posts.findIndex((p) => p.id === postId);
  if (idx === -1) return;
  posts[idx] = { ...posts[idx], views: (posts[idx].views ?? 0) + 1 };
  // 조회수 변경은 postsUpdated 이벤트를 발생시키지 않음 (무한 루프 방지)
  window.localStorage.setItem("voters.board.posts", JSON.stringify(posts));
  window.dispatchEvent(new Event("voters:postViewsUpdated"));
}

/**
 * 게시글 트렌딩 점수
 *   = 조회수 + (좋아요 × 15) + (댓글 × 10)
 * 인기 탭 기준: 10,000점 이상
 */
export function postTrendingScore(post: BoardPost, likes: number): number {
  return (post.views ?? 0) + likes * 15 + post.commentCount * 10;
}

export const HOT_SCORE_THRESHOLD = 10_000;

export function boardCategoryFromFilter(filter: FilterId): BoardCategoryId | null {
  if (filter === "popular" || filter === "recent" || filter === "all") return null;
  return filter as BoardCategoryId;
}

