import type { FilterId } from "@/components/category-filter";

const BOARD_TAB_IDS = new Set<string>([
  "popular",
  "recent",
  "sports",
  "fun",
  "stocks",
  "crypto",
  "politics",
  "game",
  "poljjak",
]);

export function isValidBoardTab(id: string | null | undefined): id is FilterId {
  return !!id && BOARD_TAB_IDS.has(id);
}

/**
 * 글쓰기/상세의 `next` 쿼리 — 같은 사이트 경로+쿼리만 허용 (오픈 리다이렉트 방지)
 */
export function safeReturnPath(raw: string | null | undefined, fallback = "/"): string {
  if (raw == null || raw === "") return fallback;
  try {
    const decoded = decodeURIComponent(raw.trim());
    if (!decoded.startsWith("/") || decoded.startsWith("//")) return fallback;
    if (decoded.includes("://")) return fallback;
    return decoded.split("#")[0] || fallback;
  } catch {
    return fallback;
  }
}
