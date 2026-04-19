"use client";

import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, MessageSquare, Settings2, Vote } from "lucide-react";
import { useInView } from "react-intersection-observer";
import { Navbar } from "@/components/navbar";
import { CategoryFilter, FilterId, isSortFilter } from "@/components/category-filter";
import { isValidBoardTab } from "@/lib/board-navigation";
import { GAME_SUBCATEGORIES } from "@/components/game-subcategory-bar";
import { SPORTS_SUBCATEGORIES } from "@/components/sports-subcategory-bar";
import { STOCKS_SUBCATEGORIES } from "@/components/stocks-subcategory-bar";
import { POLITICS_SUBCATEGORIES } from "@/components/politics-subcategory-bar";
import { MarketCard, Market, MARKET_FEED_GRID_CLASS } from "@/components/market-card";
import { CommunityBoard } from "@/components/community-board";
import { UserLeaderboard } from "@/components/leaderboard";
import {
  GameSubCategoryBar,
  type GameSubCategoryId,
} from "@/components/game-subcategory-bar";
import {
  SportsSubCategoryBar,
  type SportsSubCategoryId,
} from "@/components/sports-subcategory-bar";
import {
  StocksSubCategoryBar,
  type StocksSubCategoryId,
} from "@/components/stocks-subcategory-bar";
import {
  PoliticsSubCategoryBar,
  type PoliticsSubCategoryId,
} from "@/components/politics-subcategory-bar";
import { TrendingBetsSidebar } from "@/components/trending-bets-sidebar";
import { TrendingPostsSidebar } from "@/components/trending-posts-sidebar";
import { useUserPointsBalance } from "@/lib/points";
import { marketTrendingScore } from "@/lib/trending";
import {
  loadHomeViewMode,
  saveHomeViewMode,
  type HomeViewMode,
} from "@/lib/home-view-mode";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { parseFeedWireToMarket, type BetFeedMarketWire } from "@/lib/bets-feed-wire";
import { buildBetsFeedSearchParams } from "@/lib/bets-feed-home-query";
import { AdSlot } from "@/components/ads/ad-slot";
import { MyBoatsDialog } from "@/components/my-boats-dialog";
import { ClockProvider } from "@/lib/clock-context";

/** 인피드 광고 — N번째 카드 뒤에 삽입 */
const AD_FEED_INTERVAL = 5; // 5개 마다 광고 1개
const AD_FEED_SLOT = process.env.NEXT_PUBLIC_AD_SLOT_FEED ?? "0000000000";

const BOARD_SUB_TABS = new Set<FilterId>(["game", "sports", "stocks", "politics"]);

function dedupeAppendMarkets(prev: Market[], more: Market[]): Market[] {
  const seen = new Set(prev.map((m) => m.id));
  const add: Market[] = [];
  for (const m of more) {
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    add.push(m);
  }
  return [...prev, ...add];
}

function BetFeedListSection({
  markets,
  hasMore,
  isLoadingInitial,
  isLoadingMore,
  sentinelRef,
  emptyState,
  onMarketNavigate,
}: {
  markets: Market[];
  hasMore: boolean;
  isLoadingInitial: boolean;
  isLoadingMore: boolean;
  sentinelRef: (node: Element | null) => void;
  emptyState: ReactNode;
  onMarketNavigate: (id: string) => void;
}) {
  if (isLoadingInitial && markets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-20">
        <Loader2 className="size-10 animate-spin text-chart-5" aria-hidden />
        <p className="text-sm text-muted-foreground">보트 목록을 불러오는 중...</p>
      </div>
    );
  }
  if (markets.length === 0) return <>{emptyState}</>;

  // 카드 목록에 인피드 광고 슬롯을 N개 간격으로 삽입
  const feedItems: React.ReactNode[] = [];
  markets.forEach((market, idx) => {
    feedItems.push(
      <div key={market.id} className="flex min-h-0 min-w-0 h-full">
        <MarketCard
          market={market}
          className="h-full"
          onClick={() => onMarketNavigate(market.id)}
        />
      </div>
    );
    // AD_FEED_INTERVAL 번째마다 인피드 광고 삽입 (마지막 카드 뒤는 제외)
    if ((idx + 1) % AD_FEED_INTERVAL === 0 && idx + 1 < markets.length) {
      feedItems.push(
        <div
          key={`ad-feed-${idx}`}
          className="col-span-full"
        >
          <AdSlot
            slot={AD_FEED_SLOT}
            format="fluid"
            inFeed
            className="my-1"
            label="스폰서 광고"
          />
        </div>
      );
    }
  });

  return (
    <>
      <div className={MARKET_FEED_GRID_CLASS}>
        {feedItems}
      </div>
      <div
        ref={sentinelRef}
        className="flex w-full min-h-16 flex-col items-center justify-center py-6"
      >
        {isLoadingMore && (
          <>
            <Loader2 className="mb-2 size-8 animate-spin text-chart-5" aria-hidden />
            <p className="text-sm text-muted-foreground">보트를 더 불러오는 중...</p>
          </>
        )}
        {!hasMore && !isLoadingMore && markets.length > 0 && (
          <p className="text-xs text-muted-foreground/80">모든 보트를 불러왔습니다</p>
        )}
      </div>
    </>
  );
}

const VIEW_MODE_OPTIONS = [
  {
    mode: "split" as const,
    short: "나란히",
    title: "나란히 보기 (분할)",
  },
  {
    mode: "bets" as const,
    short: "보트",
    title: "보트만 집중해서 보기",
  },
  {
    mode: "board" as const,
    short: "게시판",
    title: "게시판만 집중해서 보기",
  },
] as const;

/** DB 피드에 resultAt이 없으면 카드 생명주기 표시용 보조 값 */
function enrichFeedResultAt(m: Market, daysAfterClose = 10): Market {
  if (m.resultAt != null) return m;
  return {
    ...m,
    resultAt: new Date(m.endsAt.getTime() + daysAfterClose * 86400000),
  };
}

export function HomeClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  /** 보트 상세로 갔다가 '보트 목록으로' 시 탭·서브·page 등 복원 */
  const feedListReturnUrl = useMemo(
    () => `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`,
    [pathname, searchParams],
  );

  const navigateToMarket = useCallback(
    (id: string) => {
      const p = new URLSearchParams();
      p.set("next", feedListReturnUrl);
      router.push(`/market/${id}?${p.toString()}`);
    },
    [router, feedListReturnUrl],
  );
  const [selectedFilter, setSelectedFilter] = useState<FilterId>("popular");
  const [gameSubCategory, setGameSubCategory] = useState<GameSubCategoryId>("all");
  const [sportsSubCategory, setSportsSubCategory] = useState<SportsSubCategoryId>("all");
  const [stocksSubCategory, setStocksSubCategory] = useState<StocksSubCategoryId>("all");
  const [politicsSubCategory, setPoliticsSubCategory] = useState<PoliticsSubCategoryId>("all");
  const [searchQuery, setSearchQuery] = useState("");

  /**
   * 탭 상태는 useEffect 보다 늦게 반영되는데, API 페치는 첫 렌더에서 바로 돈다.
   * 보트 상세에서 `/?tab=crypto` 로 돌아오면 한동안 selectedFilter 가 popular 라
   * 인기 피드를 받은 뒤 crypto 로만 필터해 목록이 비어 보였다.
   * URL의 tab/sub 를 페치·클라이언트 필터에 즉시 반영한다.
   */
  const feedTab = useMemo((): FilterId => {
    const t = searchParams.get("tab");
    if (isValidBoardTab(t)) return t;
    return selectedFilter;
  }, [searchParams, selectedFilter]);

  const subParam = searchParams.get("sub");

  const effectiveGameSub = useMemo((): GameSubCategoryId => {
    if (feedTab !== "game") return gameSubCategory;
    if (subParam && GAME_SUBCATEGORIES.some((x) => x.id === subParam))
      return subParam as GameSubCategoryId;
    return gameSubCategory;
  }, [feedTab, subParam, gameSubCategory]);

  const effectiveSportsSub = useMemo((): SportsSubCategoryId => {
    if (feedTab !== "sports") return sportsSubCategory;
    if (subParam && SPORTS_SUBCATEGORIES.some((x) => x.id === subParam))
      return subParam as SportsSubCategoryId;
    return sportsSubCategory;
  }, [feedTab, subParam, sportsSubCategory]);

  const effectiveStocksSub = useMemo((): StocksSubCategoryId => {
    if (feedTab !== "stocks") return stocksSubCategory;
    if (subParam && STOCKS_SUBCATEGORIES.some((x) => x.id === subParam))
      return subParam as StocksSubCategoryId;
    return stocksSubCategory;
  }, [feedTab, subParam, stocksSubCategory]);

  const effectivePoliticsSub = useMemo((): PoliticsSubCategoryId => {
    if (feedTab !== "politics") return politicsSubCategory;
    if (subParam && POLITICS_SUBCATEGORIES.some((x) => x.id === subParam))
      return subParam as PoliticsSubCategoryId;
    return politicsSubCategory;
  }, [feedTab, subParam, politicsSubCategory]);

  const { userId, points: userBalance } = useUserPointsBalance();
  const [viewMode, setViewMode] = useState<HomeViewMode>("split");
  const [displaySettingsOpen, setDisplaySettingsOpen] = useState(false);
  const myBoatsOpen = searchParams.get("dialog") === "myboats";
  const [isMobile, setIsMobile] = useState(false);

  // 모바일 감지 (md 기준: 768px)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    const saved = loadHomeViewMode();
    if (saved) setViewMode(saved);
  }, []);

  const applyViewMode = useCallback((m: HomeViewMode) => {
    setViewMode(m);
    saveHomeViewMode(m);
  }, []);

  // 모바일에서 split 모드면 bets로 강제 전환
  useEffect(() => {
    if (isMobile && viewMode === "split") {
      applyViewMode("bets");
    }
  }, [isMobile, viewMode, applyViewMode]);

  const [feedMarkets, setFeedMarkets] = useState<Market[]>([]);
  const [feedHasMore, setFeedHasMore] = useState(true);
  const [isLoadingFeed, setIsLoadingFeed] = useState(true);
  const [isLoadingMoreFeed, setIsLoadingMoreFeed] = useState(false);
  const nextOffsetRef = useRef(0);
  const fetchLockRef = useRef(false);

  const fetchFeedPage = useCallback(
    async (reset: boolean) => {
      if (fetchLockRef.current) return;
      if (!reset && nextOffsetRef.current === 0) return;

      fetchLockRef.current = true;
      const offset = reset ? 0 : nextOffsetRef.current;

      if (reset) {
        setIsLoadingFeed(true);
        setFeedMarkets([]);
        nextOffsetRef.current = 0;
        setFeedHasMore(true);
      } else {
        setIsLoadingMoreFeed(true);
      }

      try {
        const params = buildBetsFeedSearchParams({
          offset,
          selectedFilter: feedTab,
          gameSubCategory: effectiveGameSub,
          sportsSubCategory: effectiveSportsSub,
          stocksSubCategory: effectiveStocksSub,
          politicsSubCategory: effectivePoliticsSub,
        });
        const res = await fetch(`/api/bets-feed?${params.toString()}`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          markets?: BetFeedMarketWire[];
          hasMore?: boolean;
          offset?: number;
        };
        if (!res.ok || !j?.ok || !Array.isArray(j.markets)) {
          if (reset) setFeedMarkets([]);
          setFeedHasMore(false);
          return;
        }
        const mapped = j.markets.map(parseFeedWireToMarket);
        if (reset) {
          setFeedMarkets(mapped);
        } else {
          setFeedMarkets((prev) => dedupeAppendMarkets(prev, mapped));
        }
        const baseOff = typeof j.offset === "number" ? j.offset : offset;
        nextOffsetRef.current = baseOff + mapped.length;
        setFeedHasMore(Boolean(j.hasMore));
      } catch {
        if (reset) setFeedMarkets([]);
        setFeedHasMore(false);
      } finally {
        fetchLockRef.current = false;
        setIsLoadingFeed(false);
        setIsLoadingMoreFeed(false);
      }
    },
    [
      feedTab,
      effectiveGameSub,
      effectiveSportsSub,
      effectiveStocksSub,
      effectivePoliticsSub,
    ],
  );

  useEffect(() => {
    void fetchFeedPage(true);
  }, [fetchFeedPage]);

  useEffect(() => {
    const onStale = () => void fetchFeedPage(true);
    window.addEventListener("voters:feedBetsMaybeStale", onStale);
    return () => window.removeEventListener("voters:feedBetsMaybeStale", onStale);
  }, [fetchFeedPage]);

  const { ref: loadMoreSentinelRef, inView: loadMoreInView } = useInView({
    rootMargin: "280px 0px",
    threshold: 0,
  });

  useEffect(() => {
    if (
      !loadMoreInView ||
      !feedHasMore ||
      isLoadingFeed ||
      isLoadingMoreFeed ||
      fetchLockRef.current
    ) {
      return;
    }
    void fetchFeedPage(false);
  }, [
    loadMoreInView,
    feedHasMore,
    isLoadingFeed,
    isLoadingMoreFeed,
    fetchFeedPage,
  ]);

  useEffect(() => {
    const tabRaw = searchParams.get("tab");
    if (isValidBoardTab(tabRaw)) setSelectedFilter(tabRaw);

    const sub = searchParams.get("sub");
    if (!sub || !isValidBoardTab(tabRaw)) return;

    if (tabRaw === "game" && GAME_SUBCATEGORIES.some((x) => x.id === sub))
      setGameSubCategory(sub as GameSubCategoryId);
    if (tabRaw === "sports" && SPORTS_SUBCATEGORIES.some((x) => x.id === sub))
      setSportsSubCategory(sub as SportsSubCategoryId);
    if (tabRaw === "stocks" && STOCKS_SUBCATEGORIES.some((x) => x.id === sub))
      setStocksSubCategory(sub as StocksSubCategoryId);
    if (tabRaw === "politics" && POLITICS_SUBCATEGORIES.some((x) => x.id === sub))
      setPoliticsSubCategory(sub as PoliticsSubCategoryId);
  }, [searchParams]);

  const handleFilterSelect = useCallback(
    (f: FilterId) => {
      setSelectedFilter(f);
      const p = new URLSearchParams(searchParams.toString());
      p.set("tab", f);
      if (isSortFilter(f)) {
        p.delete("sub");
        router.replace(p.toString() ? `/?${p.toString()}` : "/", { scroll: false });
        return;
      }
      const prevRaw = searchParams.get("tab");
      const prev = isValidBoardTab(prevRaw) ? prevRaw : null;
      const fHasSub = BOARD_SUB_TABS.has(f);
      const prevHasSub = prev != null && BOARD_SUB_TABS.has(prev);
      if (!fHasSub || !prevHasSub || f !== prev) {
        p.delete("sub");
      }
      router.replace(p.toString() ? `/?${p.toString()}` : "/", { scroll: false });
    },
    [router, searchParams],
  );

  const onGameSubSelect = useCallback(
    (id: GameSubCategoryId) => {
      setGameSubCategory(id);
      const p = new URLSearchParams(searchParams.toString());
      p.set("tab", "game");
      if (id === "all") p.delete("sub");
      else p.set("sub", id);
      router.replace(p.toString() ? `/?${p.toString()}` : "/", { scroll: false });
    },
    [router, searchParams],
  );

  const onSportsSubSelect = useCallback(
    (id: SportsSubCategoryId) => {
      setSportsSubCategory(id);
      const p = new URLSearchParams(searchParams.toString());
      p.set("tab", "sports");
      if (id === "all") p.delete("sub");
      else p.set("sub", id);
      router.replace(p.toString() ? `/?${p.toString()}` : "/", { scroll: false });
    },
    [router, searchParams],
  );

  const onStocksSubSelect = useCallback(
    (id: StocksSubCategoryId) => {
      setStocksSubCategory(id);
      const p = new URLSearchParams(searchParams.toString());
      p.set("tab", "stocks");
      if (id === "all") p.delete("sub");
      else p.set("sub", id);
      router.replace(p.toString() ? `/?${p.toString()}` : "/", { scroll: false });
    },
    [router, searchParams],
  );

  const onPoliticsSubSelect = useCallback(
    (id: PoliticsSubCategoryId) => {
      setPoliticsSubCategory(id);
      const p = new URLSearchParams(searchParams.toString());
      p.set("tab", "politics");
      if (id === "all") p.delete("sub");
      else p.set("sub", id);
      router.replace(p.toString() ? `/?${p.toString()}` : "/", { scroll: false });
    },
    [router, searchParams],
  );

  useEffect(() => {
    if (feedTab !== "game") setGameSubCategory("all");
    if (feedTab !== "sports") setSportsSubCategory("all");
    if (feedTab !== "stocks") setStocksSubCategory("all");
    if (feedTab !== "politics") setPoliticsSubCategory("all");
  }, [feedTab]);


  const sortMode = isSortFilter(feedTab) ? feedTab : "popular";
  const categoryFilter = isSortFilter(feedTab) ? "all" : feedTab;

  const boardActiveSubTabId = useMemo(() => {
    switch (feedTab) {
      case "game":
        return effectiveGameSub;
      case "sports":
        return effectiveSportsSub;
      case "stocks":
        return effectiveStocksSub;
      case "politics":
        return effectivePoliticsSub;
      default:
        return undefined;
    }
  }, [
    feedTab,
    effectiveGameSub,
    effectiveSportsSub,
    effectiveStocksSub,
    effectivePoliticsSub,
  ]);

  const mergedMarkets = useMemo(
    () => feedMarkets.map((m) => enrichFeedResultAt(m)),
    [feedMarkets],
  );

  /** 트렌딩 순으로 한 번만 정렬 (filteredMarkets와 trendingSidebarMarkets에서 재사용) */
  const sortedByTrending = useMemo(
    () => [...mergedMarkets].sort((a, b) => marketTrendingScore(b) - marketTrendingScore(a)),
    [mergedMarkets],
  );

  const filteredMarkets = useMemo(() => {
    const matchesFilter = (market: Market) => {
      const matchesCategory =
        categoryFilter === "all" || market.category === categoryFilter;
      const matchesSub =
        categoryFilter === "game"
          ? effectiveGameSub === "all" ||
            (market.subCategory ?? "other") === effectiveGameSub
          : categoryFilter === "sports"
            ? effectiveSportsSub === "all" ||
              (market.subCategory ?? "other") === effectiveSportsSub
            : categoryFilter === "stocks"
              ? effectiveStocksSub === "all" ||
                (market.subCategory ?? "other") === effectiveStocksSub
              : categoryFilter === "politics"
                ? effectivePoliticsSub === "all" ||
                  (market.subCategory ?? "other") === effectivePoliticsSub
            : true;
      const matchesSearch = market.question
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSub && matchesSearch;
    };

    if (sortMode === "popular") {
      // 이미 트렌딩 순으로 정렬된 배열에서 필터만 적용
      return sortedByTrending.filter(matchesFilter);
    }

    // 최신 탭: 서버가 `created_desc`로 이미 정렬 — 클라이언트 재정렬 없이 필터만
    return mergedMarkets.filter(matchesFilter);
  }, [
    sortMode,
    sortedByTrending,
    categoryFilter,
    effectiveGameSub,
    effectiveSportsSub,
    effectiveStocksSub,
    effectivePoliticsSub,
    searchQuery,
    mergedMarkets,
  ]);

  /** 게시판 전용 모드 사이드바: 트렌딩 상위 보트 (sortedByTrending 재사용) */
  const trendingSidebarMarkets = useMemo(
    () => sortedByTrending.slice(0, 5),
    [sortedByTrending],
  );

  const betFeedEmpty = (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 flex size-16 items-center justify-center rounded-full bg-secondary">
        <span className="text-3xl text-muted-foreground">?</span>
      </div>
      <h3 className="mb-2 text-lg font-semibold text-foreground">
        표시할 보트가 없습니다
      </h3>
      <p className="max-w-sm text-sm text-muted-foreground">
        {searchQuery
          ? `"${searchQuery}"에 해당하는 보트가 없습니다. 다른 검색어를 시도해보세요.`
          : "이 카테고리에는 아직 보트가 없습니다."}
      </p>
    </div>
  );

  return (
    <ClockProvider>
    <div className="min-h-screen bg-background">
      <Navbar
        balance={userBalance}
        userId={userId}
        searchQuery={searchQuery}
        onSearch={setSearchQuery}
      />

      {/* 모바일 전용 고정 탭 (md 미만에서만 표시) */}
      <div className="sticky top-14 z-20 flex md:hidden border-b border-border/60 bg-background/95 backdrop-blur-sm">
        <button
          type="button"
          onClick={() => applyViewMode("bets")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors",
            viewMode !== "board"
              ? "border-b-2 border-chart-5 text-chart-5"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Vote className="size-4" />
          보트
        </button>
        <button
          type="button"
          onClick={() => applyViewMode("board")}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 py-3 text-sm font-semibold transition-colors",
            viewMode === "board"
              ? "border-b-2 border-chart-5 text-chart-5"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <MessageSquare className="size-4" />
          게시판
        </button>
      </div>

      {/* Unified Filter List + Leaderboard */}
      <div className="px-4 py-4 border-b border-border/50">
        <div className="grid grid-cols-1 xl:grid-cols-[10%_minmax(0,1fr)_10%] items-center gap-4">
          <aside className="hidden xl:block" />
          {/* 카테고리 탭 + 유저 순위를 한 행으로 */}
          <div className="flex flex-wrap items-center gap-3 min-w-0">
            <div className="flex-1 min-w-0 basis-full sm:basis-auto">
              <CategoryFilter
                selected={feedTab}
                onSelect={handleFilterSelect}
              />
              <div
                className={cn(
                  "grid transition-[grid-template-rows] duration-300 ease-out",
                  feedTab === "game" ||
                    feedTab === "sports" ||
                    feedTab === "stocks" ||
                    feedTab === "politics"
                    ? "grid-rows-[1fr]"
                    : "grid-rows-[0fr]",
                )}
                aria-hidden={
                  feedTab !== "game" &&
                  feedTab !== "sports" &&
                  feedTab !== "stocks" &&
                  feedTab !== "politics"
                }
              >
                <div className="min-h-0 overflow-hidden">
                  <div
                    className={cn(
                      "pt-2 transition-all duration-300 ease-out",
                      feedTab === "game" ||
                        feedTab === "sports" ||
                        feedTab === "stocks" ||
                        feedTab === "politics"
                        ? "translate-y-0 opacity-100"
                        : "-translate-y-1 opacity-0 pointer-events-none",
                    )}
                  >
                    {feedTab === "game" ? (
                      <GameSubCategoryBar
                        selected={gameSubCategory}
                        onSelect={onGameSubSelect}
                      />
                    ) : feedTab === "sports" ? (
                      <SportsSubCategoryBar
                        selected={sportsSubCategory}
                        onSelect={onSportsSubSelect}
                      />
                    ) : feedTab === "stocks" ? (
                      <StocksSubCategoryBar
                        selected={stocksSubCategory}
                        onSelect={onStocksSubSelect}
                      />
                    ) : feedTab === "politics" ? (
                      <PoliticsSubCategoryBar
                        selected={politicsSubCategory}
                        onSelect={onPoliticsSubSelect}
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
            {userId && userId !== "anon" && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 shrink-0 gap-1.5 border-border/60 text-xs sm:text-sm"
                onClick={() => {
                  const sp = new URLSearchParams(searchParams.toString());
                  sp.set("dialog", "myboats");
                  router.push(pathname + "?" + sp.toString());
                }}
              >
                <Vote className="size-3.5" aria-hidden />
                My 보트
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 shrink-0 gap-1.5 border-border/60 text-xs sm:text-sm"
              onClick={() => setDisplaySettingsOpen(true)}
            >
              <Settings2 className="size-3.5" aria-hidden />
              표시 설정
            </Button>
            <div className="hidden lg:block shrink-0">
              <UserLeaderboard className="w-52" />
            </div>
          </div>
          <aside className="hidden xl:block" />
        </div>
      </div>

      <main className="px-4 pt-0 pb-6 md:pt-0 md:pb-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-[10%_minmax(0,7fr)_minmax(0,5fr)_10%] gap-6 lg:gap-8">
          {/* Left Ad Space */}
          <aside className="hidden xl:block">
            <div className="h-full rounded-xl border border-border/40 bg-secondary/10" />
          </aside>

          {/* split 모드: 데스크탑 2컬럼 / 모바일은 이 분기 자체가 없으므로 방어 렌더 */}
          {viewMode === "split" && (
            <>
              {/* 데스크탑: 보트 피드 */}
              <section className="min-w-0 xl:col-start-2">
                <BetFeedListSection
                  markets={filteredMarkets}
                  hasMore={feedHasMore}
                  isLoadingInitial={isLoadingFeed}
                  isLoadingMore={isLoadingMoreFeed}
                  sentinelRef={loadMoreSentinelRef}
                  emptyState={betFeedEmpty}
                  onMarketNavigate={navigateToMarket}
                />
              </section>
              {/* 데스크탑: 게시판 사이드 (모바일에서는 hidden) */}
              <aside className="hidden md:block lg:sticky lg:top-[88px] h-[560px] lg:h-[calc(100vh-120px)] xl:col-start-3">
                <CommunityBoard
                  activeFilter={feedTab}
                  activeSubTabId={boardActiveSubTabId}
                  searchQuery={searchQuery}
                  className="h-full"
                />
              </aside>
            </>
          )}

          {/* board 모드: 베팅 집중 모드와 같은 비율(넓은 메인 + 고정폭 사이드)으로 게시판 영역 확대 */}
          {viewMode === "board" && (
            <div
              className={cn(
                "min-w-0 xl:col-start-2 xl:col-end-4",
                "grid grid-cols-1 gap-6 lg:gap-6 lg:items-start",
                "lg:grid-cols-[minmax(0,1fr)_minmax(200px,260px)]",
              )}
            >
              <div
                className={cn(
                  "min-w-0 w-full",
                  "max-lg:max-w-xl max-lg:mx-auto",
                  "min-h-[560px] lg:min-h-[calc(100vh-120px)]",
                )}
              >
                <CommunityBoard
                  activeFilter={feedTab}
                  activeSubTabId={boardActiveSubTabId}
                  searchQuery={searchQuery}
                  className="h-full min-h-0"
                />
              </div>
              <aside
                className={cn(
                  "w-full min-w-0 shrink-0",
                  "max-lg:max-w-xl max-lg:mx-auto",
                  "lg:sticky lg:top-[88px] lg:self-start",
                  "lg:max-h-[calc(100vh-120px)] lg:overflow-y-auto",
                )}
              >
                <TrendingBetsSidebar markets={trendingSidebarMarkets} listReturnUrl={feedListReturnUrl} />
              </aside>
            </div>
          )}

          {/* bets 모드: 넓은 보트 영역 + 좁은 핫 토론 사이드바 */}
          {viewMode === "bets" && (
            <div
              className={cn(
                "min-w-0 xl:col-start-2 xl:col-end-4",
                "grid grid-cols-1 gap-6 lg:gap-6 lg:items-start",
                "lg:grid-cols-[minmax(0,1fr)_minmax(200px,260px)]",
              )}
            >
              <section className="min-w-0">
                <BetFeedListSection
                  markets={filteredMarkets}
                  hasMore={feedHasMore}
                  isLoadingInitial={isLoadingFeed}
                  isLoadingMore={isLoadingMoreFeed}
                  sentinelRef={loadMoreSentinelRef}
                  emptyState={betFeedEmpty}
                  onMarketNavigate={navigateToMarket}
                />
              </section>
              <aside
                className={cn(
                  "hidden lg:block w-full min-w-0 shrink-0",
                  "lg:sticky lg:top-20 lg:self-start",
                  "lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto",
                )}
              >
                <TrendingPostsSidebar className="w-full" />
              </aside>
            </div>
          )}

          {/* Right Ad Space */}
          <aside className="hidden xl:block xl:col-start-4">
            <div className="h-full rounded-xl border border-border/40 bg-secondary/10" />
          </aside>
        </div>
      </main>

      <Dialog open={displaySettingsOpen} onOpenChange={setDisplaySettingsOpen}>
        <DialogContent className="sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Settings2 className="size-5 text-chart-5" />
              홈 화면 표시
            </DialogTitle>
            <DialogDescription>
              보트 목록과 게시판을 어떻게 배치할지 선택합니다. 기기에 저장됩니다.
            </DialogDescription>
          </DialogHeader>
          <div role="tablist" aria-label="홈 화면 표시 방식" className="flex flex-col gap-2 pt-1">
            <div className="inline-flex w-full flex-col gap-1 rounded-xl border border-border/60 bg-secondary/30 p-1 shadow-sm sm:flex-row sm:items-stretch">
              {VIEW_MODE_OPTIONS.map(({ mode, short, title }) => {
                const active = viewMode === mode;
                // 모바일에서 '나란히(분할)' 버튼 숨김
                if (mode === "split" && isMobile) return null;
                return (
                  <button
                    key={mode}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    title={title}
                    onClick={() => {
                      applyViewMode(mode);
                    }}
                    className={
                      "flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg px-2 py-2 text-sm font-medium transition-all duration-300 ease-out sm:px-3 " +
                      (active
                        ? "bg-chart-5 text-primary-foreground shadow-md shadow-chart-5/25"
                        : "text-muted-foreground hover:bg-secondary/80 hover:text-foreground")
                    }
                  >
                    <span className="text-center leading-snug">
                      <span className="sm:hidden">{short}</span>
                      <span className="hidden sm:inline">{title}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex justify-end pt-2">
            <Button type="button" variant="secondary" onClick={() => setDisplaySettingsOpen(false)}>
              닫기
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <MyBoatsDialog
        open={myBoatsOpen}
        onOpenChange={(v) => {
          if (!v) {
            const sp = new URLSearchParams(searchParams.toString());
            sp.delete("dialog");
            const q = sp.toString();
            router.replace(pathname + (q ? "?" + q : ""));
          }
        }}
        userId={userId}
      />
    </div>
    </ClockProvider>
  );
}
