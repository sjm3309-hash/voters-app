import type { FilterId } from "@/components/category-filter";

/**
 * 메인 탭(정렬 + 카테고리) 영문 ID → 한글 표시명
 * 예: { popular: '인기', sports: '스포츠', default: '전체' }
 */
export const BOARD_TAB_NAMES: Record<string, string> = {
  default: "전체",
  all: "전체",
  popular: "인기",
  recent: "최신",
  sports: "스포츠",
  fun: "재미",
  stocks: "주식",
  crypto: "크립토",
  politics: "정치",
  game: "게임",
};

/**
 * 세부 탭(게임·스포츠·주식·정치 서브카테고리) ID → 한글 표시명
 * 예: baseball_kr → 국내야구, football → 해외축구
 */
export const BOARD_SUB_TAB_NAMES: Record<string, string> = {
  all: "전체",
  // game
  lol: "LoL",
  valorant: "발로란트",
  starcraft: "스타크래프트",
  // sports
  baseball_kr: "국내야구",
  football: "해외축구",
  basketball: "농구",
  // stocks / politics 공통 id (라벨 동일)
  domestic: "국내",
  overseas: "해외",
  // 공통 기타
  other: "기타",
};

export function getBoardMainTabLabel(activeFilter?: FilterId | null): string {
  if (activeFilter == null || activeFilter === "") {
    return BOARD_TAB_NAMES.default;
  }
  return BOARD_TAB_NAMES[activeFilter] ?? BOARD_TAB_NAMES.default;
}

/** 예: "스포츠 게시판", 기본 "전체 게시판" */
export function getBoardMainTitle(activeFilter?: FilterId | null): string {
  return `${getBoardMainTabLabel(activeFilter)} 게시판`;
}

const SUB_TAB_PARENTS = new Set<FilterId>(["game", "sports", "stocks", "politics"]);

/**
 * 세부 탭이 `all`이 아니고, 카테고리가 세부 탭을 가진 경우에만 문구 생성.
 * 예: "국내야구 글만 표시중"
 */
export function getBoardSubTabLine(
  activeFilter: FilterId | undefined | null,
  activeSubTabId: string | undefined | null,
): string | null {
  if (!activeFilter || !SUB_TAB_PARENTS.has(activeFilter)) return null;
  const id = activeSubTabId?.trim();
  if (!id || id === "all") return null;
  const label = BOARD_SUB_TAB_NAMES[id];
  if (!label) return null;
  return `${label} 글만 표시중`;
}
