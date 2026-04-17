import type { CategoryId, FilterId } from "@/components/category-filter";

export type BoardCategoryId = Exclude<CategoryId, "all"> | "suggest";

export type BoardPost = {
  id: string;
  title: string;
  content: string; // plain text (search-friendly)
  contentHtml?: string; // rich text (render)
  category: BoardCategoryId;
  thumbnail?: string;
  images?: string[]; // data URLs (local-only)
  commentCount: number;
  views?: number;    // 조회수
  author: string;
  createdAt: string; // ISO
  isHot?: boolean;
};

const STORAGE_KEY = "voters.board.posts";

export function loadBoardPosts(): BoardPost[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as BoardPost[];
    if (!Array.isArray(parsed)) return [];
    // migrate legacy categories
    const migrated = parsed.map((p) => {
      const cat = (p as any).category;
      if (cat === "community") return { ...p, category: "fun" } as BoardPost;
      return p;
    });
    if (migrated.some((p, i) => p !== parsed[i])) saveBoardPosts(migrated);
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

