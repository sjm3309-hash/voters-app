import type { CategoryId, FilterId } from "@/components/category-filter";
import { isSortFilter } from "@/components/category-filter";
import type { GameSubCategoryId } from "@/components/game-subcategory-bar";
import type { SportsSubCategoryId } from "@/components/sports-subcategory-bar";
import type { StocksSubCategoryId } from "@/components/stocks-subcategory-bar";
import type { PoliticsSubCategoryId } from "@/components/politics-subcategory-bar";
import { marketCategoryIdToDbLabel } from "@/lib/market-category-db";

/** 무한 스크롤 페이지 크기 — API·클라이언트 공통 */
export const BETS_FEED_PAGE_SIZE = 10;

function resolveSubCategoryDb(
  categoryFilter: CategoryId,
  args: {
    gameSubCategory: GameSubCategoryId;
    sportsSubCategory: SportsSubCategoryId;
    stocksSubCategory: StocksSubCategoryId;
    politicsSubCategory: PoliticsSubCategoryId;
  },
): string | null {
  if (categoryFilter === "game" && args.gameSubCategory !== "all") {
    const m: Record<GameSubCategoryId, string> = {
      all: "",
      lol: "LoL",
      valorant: "VALORANT",
      starcraft: "StarCraft",
      other: "기타",
    };
    return m[args.gameSubCategory] ?? null;
  }
  if (categoryFilter === "sports" && args.sportsSubCategory !== "all") {
    const m: Record<SportsSubCategoryId, string> = {
      all: "",
      baseball_kr: "국내야구",
      football: "해외축구",
      basketball: "농구",
      other: "기타",
    };
    return m[args.sportsSubCategory] ?? null;
  }
  if (categoryFilter === "stocks" && args.stocksSubCategory !== "all") {
    const m: Record<StocksSubCategoryId, string> = {
      all: "",
      domestic: "국내주식",
      overseas: "해외주식",
    };
    return m[args.stocksSubCategory] ?? null;
  }
  if (categoryFilter === "politics" && args.politicsSubCategory !== "all") {
    const m: Record<PoliticsSubCategoryId, string> = {
      all: "",
      domestic: "국내정치",
      overseas: "해외정치",
    };
    return m[args.politicsSubCategory] ?? null;
  }
  return null;
}

/** `/api/bets-feed` GET 쿼리 — 서버 정렬·필터와 동일하게 유지 */
export function buildBetsFeedSearchParams(args: {
  offset: number;
  selectedFilter: FilterId;
  gameSubCategory: GameSubCategoryId;
  sportsSubCategory: SportsSubCategoryId;
  stocksSubCategory: StocksSubCategoryId;
  politicsSubCategory: PoliticsSubCategoryId;
}): URLSearchParams {
  const p = new URLSearchParams();
  p.set("offset", String(Math.max(0, args.offset)));
  p.set("limit", String(BETS_FEED_PAGE_SIZE));
  const apiSort = args.selectedFilter === "recent" ? "created_desc" : "smart";
  p.set("sort", apiSort);

  const categoryFilter: CategoryId = isSortFilter(args.selectedFilter)
    ? "all"
    : args.selectedFilter;
  if (categoryFilter !== "all") {
    p.set("category", marketCategoryIdToDbLabel(categoryFilter));
  }
  const sub = resolveSubCategoryDb(categoryFilter, {
    gameSubCategory: args.gameSubCategory,
    sportsSubCategory: args.sportsSubCategory,
    stocksSubCategory: args.stocksSubCategory,
    politicsSubCategory: args.politicsSubCategory,
  });
  if (sub) p.set("sub_category", sub);
  return p;
}
