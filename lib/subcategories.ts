/**
 * 카테고리별 세부 카테고리 — 홈 필터 바 / 보트 만들기 / 게시판 글쓰기 공통 소스
 *
 * - "all" 항목은 필터 바 전용이므로 여기에는 포함하지 않음
 * - 정의가 없는 카테고리(fun, crypto)는 세부 카테고리 없음
 */

export type SubCategoryItem = { id: string; label: string };

export const SUBCATEGORIES: Record<string, SubCategoryItem[]> = {
  sports: [
    { id: "baseball_kr", label: "국내야구" },
    { id: "football",    label: "해외축구" },
    { id: "basketball",  label: "농구" },
    { id: "other",       label: "기타" },
  ],
  game: [
    { id: "lol",       label: "LoL" },
    { id: "valorant",  label: "발로란트" },
    { id: "starcraft", label: "스타크래프트" },
    { id: "other",     label: "기타" },
  ],
  stocks: [
    { id: "domestic", label: "국내" },
    { id: "overseas", label: "해외" },
    { id: "other",    label: "기타" },
  ],
  politics: [
    { id: "domestic", label: "국내" },
    { id: "overseas", label: "해외" },
    { id: "other",    label: "기타" },
  ],
  // fun, crypto → 세부 카테고리 없음
};

/** 해당 카테고리에 세부 카테고리가 있는지 여부 */
export function hasSubCategories(categoryId: string): boolean {
  return (SUBCATEGORIES[categoryId]?.length ?? 0) > 0;
}

/** 해당 카테고리의 세부 카테고리 목록 (없으면 빈 배열) */
export function getSubCategories(categoryId: string): SubCategoryItem[] {
  return SUBCATEGORIES[categoryId] ?? [];
}

/** 세부 카테고리의 기본값 (첫 번째 항목 id, 없으면 null) */
export function defaultSubCategory(categoryId: string): string | null {
  return SUBCATEGORIES[categoryId]?.[0]?.id ?? null;
}
