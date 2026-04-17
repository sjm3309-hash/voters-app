"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Settings2 } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { CategoryFilter, FilterId, isSortFilter } from "@/components/category-filter";
import { MarketCard, Market } from "@/components/market-card";
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
import { checkAndGrantAttendance } from "@/lib/daily-rewards";
import { loadUserMarkets } from "@/lib/markets";
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

const VIEW_MODE_OPTIONS = [
  {
    mode: "split" as const,
    short: "나란히",
    title: "나란히 보기 (분할)",
  },
  {
    mode: "bets" as const,
    short: "베팅",
    title: "베팅만 집중해서 보기",
  },
  {
    mode: "board" as const,
    short: "게시판",
    title: "게시판만 집중해서 보기",
  },
] as const;

// Colors for multi-choice options
const optionColors = [
  "oklch(0.7 0.18 230)",  // neon blue
  "oklch(0.7 0.18 150)",  // neon green
  "oklch(0.65 0.22 25)",  // neon red
  "oklch(0.75 0.15 80)",  // yellow/gold
  "oklch(0.65 0.2 300)",  // purple
];

/** 목 보트에 resultAt이 없으면 마감 후 N일 뒤로 가정 (카드 생명주기 표시용) */
function enrichMockResultAt(m: Market, daysAfterClose = 10): Market {
  if (m.resultAt != null) return m;
  return {
    ...m,
    resultAt: new Date(m.endsAt.getTime() + daysAfterClose * 86400000),
  };
}

/** 모듈 로드 시점 기준: 결과 대기 / 정산 완료 데모 (3가지 상태 확인용) */
const lifecycleDemoMarkets: Market[] = (() => {
  const ms = 86400000;
  const t = Date.now();
  return [
    {
      id: "demo-waiting",
      question: "[데모] 결과 대기 중 (베팅 마감 · 발표 전)",
      category: "fun" as const,
      options: [
        { id: "dwa", label: "옵션 A", percentage: 50, color: optionColors[0] },
        { id: "dwb", label: "옵션 B", percentage: 50, color: optionColors[1] },
      ],
      totalPool: 99000,
      comments: 12,
      endsAt: new Date(t - 2 * ms),
      resultAt: new Date(t + 5 * ms),
      createdAt: new Date(t - 10 * ms),
    },
    {
      id: "demo-completed",
      question: "[데모] 정산 완료 (결과 확정)",
      category: "fun" as const,
      options: [
        { id: "dca", label: "적중", percentage: 100, color: optionColors[1] },
        { id: "dcb", label: "기타", percentage: 0, color: optionColors[2] },
      ],
      totalPool: 120000,
      comments: 45,
      endsAt: new Date(t - 14 * ms),
      resultAt: new Date(t - 7 * ms),
      winningOptionId: "dca",
      createdAt: new Date(t - 20 * ms),
    },
  ];
})();

const mockMarkets: Market[] = [
  {
    id: "1",
    question: "다음 미국 대선의 최종 승자는 누구일까?",
    category: "politics",
    options: [
      { id: "1a", label: "트럼프", percentage: 55, color: optionColors[0] },
      { id: "1b", label: "바이든", percentage: 45, color: optionColors[1] },
    ],
    totalPool: 1250000,
    comments: 432,
    endsAt: new Date("2028-11-05"),
    createdAt: new Date(Date.now() - 72 * 60 * 60 * 1000),   // 3일 전
  },
  {
    id: "2",
    question: "삼성전자 이번 달 8만 전자 돌파할까?",
    category: "stocks",
    options: [
      { id: "2a", label: "돌파한다", percentage: 38, color: optionColors[1] },
      { id: "2b", label: "못한다", percentage: 62, color: optionColors[2] },
    ],
    totalPool: 890000,
    comments: 156,
    endsAt: new Date("2026-04-30"),
    createdAt: new Date(Date.now() - 18 * 60 * 60 * 1000),   // 18시간 전
  },
  {
    id: "3",
    question: "비트코인 2026년 내 15만 달러 돌파?",
    category: "crypto",
    options: [
      { id: "3a", label: "돌파", percentage: 67, color: optionColors[1] },
      { id: "3b", label: "미돌파", percentage: 33, color: optionColors[2] },
    ],
    totalPool: 2340000,
    comments: 567,
    endsAt: new Date("2026-12-31"),
    createdAt: new Date(Date.now() - 120 * 60 * 60 * 1000),  // 5일 전
  },
  {
    id: "4",
    question: "2026 월드컵 우승국은?",
    category: "sports",
    options: [
      { id: "4a", label: "브라질", percentage: 28, color: optionColors[1] },
      { id: "4b", label: "아르헨티나", percentage: 25, color: optionColors[0] },
      { id: "4c", label: "프랑스", percentage: 22, color: optionColors[2] },
      { id: "4d", label: "기타", percentage: 25, color: optionColors[3] },
    ],
    totalPool: 3200000,
    comments: 892,
    endsAt: new Date("2026-07-19"),
    createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),   // 2일 전
  },
  {
    id: "5",
    question: "이더리움 가격이 비트코인을 추월할까?",
    category: "crypto",
    options: [
      { id: "5a", label: "추월한다", percentage: 15, color: optionColors[1] },
      { id: "5b", label: "추월 못함", percentage: 85, color: optionColors[2] },
    ],
    totalPool: 567000,
    comments: 234,
    endsAt: new Date("2027-12-31"),
    createdAt: new Date(Date.now() - 6 * 60 * 60 * 1000),    // 6시간 전
  },
  {
    id: "6",
    question: "테슬라 주가 2026년 500달러 돌파?",
    category: "stocks",
    options: [
      { id: "6a", label: "돌파", percentage: 42, color: optionColors[1] },
      { id: "6b", label: "미돌파", percentage: 58, color: optionColors[2] },
    ],
    totalPool: 1120000,
    comments: 321,
    endsAt: new Date("2026-12-31"),
    createdAt: new Date(Date.now() - 36 * 60 * 60 * 1000),   // 1.5일 전
  },
  {
    id: "7",
    question: "다음 한국 대통령 선거 당선자는?",
    category: "politics",
    options: [
      { id: "7a", label: "여당 후보", percentage: 48, color: optionColors[0] },
      { id: "7b", label: "야당 후보", percentage: 47, color: optionColors[1] },
      { id: "7c", label: "제3후보", percentage: 5, color: optionColors[3] },
    ],
    totalPool: 4500000,
    comments: 1234,
    endsAt: new Date("2027-03-09"),
    createdAt: new Date(Date.now() - 96 * 60 * 60 * 1000),   // 4일 전
  },
  {
    id: "8",
    question: "OpenAI가 2026년 내 IPO 할까?",
    category: "fun",
    options: [
      { id: "8a", label: "IPO 진행", percentage: 35, color: optionColors[1] },
      { id: "8b", label: "진행 안함", percentage: 65, color: optionColors[2] },
    ],
    totalPool: 780000,
    comments: 189,
    endsAt: new Date("2026-12-31"),
    createdAt: new Date(Date.now() - 10 * 60 * 60 * 1000),   // 10시간 전
  },
  {
    id: "9",
    question: "올해 밈(Meme) 코인 대장, 도지는 다시 날아오를까?",
    category: "fun",
    options: [
      { id: "9a", label: "날아오른다", percentage: 52, color: optionColors[0] },
      { id: "9b", label: "그냥 밈이다", percentage: 48, color: optionColors[2] },
    ],
    totalPool: 420000,
    comments: 77,
    endsAt: new Date("2026-06-30"),
    createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000),    // 3시간 전
  },
  {
    id: "10",
    question: "올해 GOTY(Game of the Year)는 어떤 게임이 될까?",
    category: "game",
    options: [
      { id: "10a", label: "AAA 대작", percentage: 44, color: optionColors[1] },
      { id: "10b", label: "인디 돌풍", percentage: 56, color: optionColors[0] },
    ],
    totalPool: 510000,
    comments: 64,
    endsAt: new Date("2026-12-31"),
    createdAt: new Date(Date.now() - 14 * 60 * 60 * 1000),   // 14시간 전
  },
].map((m) => enrichMockResultAt(m));

export function HomeClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedFilter, setSelectedFilter] = useState<FilterId>("popular");
  const [gameSubCategory, setGameSubCategory] = useState<GameSubCategoryId>("all");
  const [sportsSubCategory, setSportsSubCategory] = useState<SportsSubCategoryId>("all");
  const [stocksSubCategory, setStocksSubCategory] = useState<StocksSubCategoryId>("all");
  const [politicsSubCategory, setPoliticsSubCategory] = useState<PoliticsSubCategoryId>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const { userId, points: userBalance } = useUserPointsBalance();
  const [viewMode, setViewMode] = useState<HomeViewMode>("split");
  const [displaySettingsOpen, setDisplaySettingsOpen] = useState(false);

  useEffect(() => {
    const saved = loadHomeViewMode();
    if (saved) setViewMode(saved);
  }, []);

  const applyViewMode = useCallback((m: HomeViewMode) => {
    setViewMode(m);
    saveHomeViewMode(m);
  }, []);

  // 사용자 생성 보트 (localStorage)
  const [userMarkets, setUserMarkets] = useState<Market[]>([]);
  useEffect(() => {
    const load = () => {
      const raw = loadUserMarkets();
      setUserMarkets(
        raw.map((m) => ({
          id: m.id,
          question: m.question,
          category: m.category as Market["category"],
          subCategory: m.subCategory,
          options: m.options,
          totalPool: m.totalPool,
          participants: m.participants ?? 0,
          comments: 0,
          endsAt: new Date(m.endsAt),
          createdAt: m.createdAt ? new Date(m.createdAt) : new Date(),
          resultAt: m.resultAt ? new Date(m.resultAt) : undefined,
          winningOptionId: m.winningOptionId,
        }))
      );
    };
    load();
    window.addEventListener("voters:marketsUpdated", load);
    return () => window.removeEventListener("voters:marketsUpdated", load);
  }, []);

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "popular") setSelectedFilter("popular");
  }, [searchParams]);

  useEffect(() => {
    if (selectedFilter !== "game") setGameSubCategory("all");
    if (selectedFilter !== "sports") setSportsSubCategory("all");
    if (selectedFilter !== "stocks") setStocksSubCategory("all");
    if (selectedFilter !== "politics") setPoliticsSubCategory("all");
  }, [selectedFilter]);

  // 로그인된 유저에게 출석 보상 지급 (하루 1회)
  useEffect(() => {
    if (userId && userId !== "anon") {
      checkAndGrantAttendance(userId);
    }
  }, [userId]);

  const sortMode = isSortFilter(selectedFilter) ? selectedFilter : "popular";
  const categoryFilter = isSortFilter(selectedFilter) ? "all" : selectedFilter;

  const filteredMarkets = useMemo(() => {
    const allMarkets = [...userMarkets, ...lifecycleDemoMarkets, ...mockMarkets];

    const matchesFilter = (market: Market) => {
      const matchesCategory =
        categoryFilter === "all" || market.category === categoryFilter;
      const matchesSub =
        categoryFilter === "game"
          ? gameSubCategory === "all" ||
            (market.subCategory ?? "other") === gameSubCategory
          : categoryFilter === "sports"
            ? sportsSubCategory === "all" ||
              (market.subCategory ?? "other") === sportsSubCategory
            : categoryFilter === "stocks"
              ? stocksSubCategory === "all" ||
                (market.subCategory ?? "other") === stocksSubCategory
              : categoryFilter === "politics"
                ? politicsSubCategory === "all" ||
                  (market.subCategory ?? "other") === politicsSubCategory
            : true;
      const matchesSearch = market.question
        .toLowerCase()
        .includes(searchQuery.toLowerCase());
      return matchesCategory && matchesSub && matchesSearch;
    };

    if (sortMode === "popular") {
      // 트렌딩 점수 기준 정렬, 최대 10개
      return [...allMarkets]
        .sort(
          (a, b) =>
            marketTrendingScore(b) - marketTrendingScore(a),
        )
        .filter(matchesFilter)
        .slice(0, 10);
    }

    // 최신 탭: 마감일 가까운 순 (오름차순)
    return [...allMarkets]
      .sort((a, b) => a.endsAt.getTime() - b.endsAt.getTime())
      .filter(matchesFilter);
  }, [sortMode, categoryFilter, gameSubCategory, sportsSubCategory, stocksSubCategory, politicsSubCategory, searchQuery, userMarkets]);

  /** 게시판 전용 모드 사이드바: 트렌딩 상위 보트 */
  const trendingSidebarMarkets = useMemo(() => {
    const all = [...userMarkets, ...lifecycleDemoMarkets, ...mockMarkets];
    return [...all]
      .sort((a, b) => marketTrendingScore(b) - marketTrendingScore(a))
      .slice(0, 5);
  }, [userMarkets]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar
        balance={userBalance}
        userId={userId}
        searchQuery={searchQuery}
        onSearch={setSearchQuery}
      />

      {/* Unified Filter List + Leaderboard */}
      <div className="px-4 py-4 border-b border-border/50">
        <div className="grid grid-cols-1 xl:grid-cols-[10%_minmax(0,1fr)_10%] items-center gap-4">
          <aside className="hidden xl:block" />
          {/* 카테고리 탭 + 유저 순위를 한 행으로 */}
          <div className="flex flex-wrap items-center gap-3 min-w-0">
            <div className="flex-1 min-w-0 basis-full sm:basis-auto">
              <CategoryFilter
                selected={selectedFilter}
                onSelect={setSelectedFilter}
              />
              <div
                className={cn(
                  "grid transition-[grid-template-rows] duration-300 ease-out",
                  selectedFilter === "game" ||
                    selectedFilter === "sports" ||
                    selectedFilter === "stocks" ||
                    selectedFilter === "politics"
                    ? "grid-rows-[1fr]"
                    : "grid-rows-[0fr]",
                )}
                aria-hidden={
                  selectedFilter !== "game" &&
                  selectedFilter !== "sports" &&
                  selectedFilter !== "stocks" &&
                  selectedFilter !== "politics"
                }
              >
                <div className="min-h-0 overflow-hidden">
                  <div
                    className={cn(
                      "pt-2 transition-all duration-300 ease-out",
                      selectedFilter === "game" ||
                        selectedFilter === "sports" ||
                        selectedFilter === "stocks" ||
                        selectedFilter === "politics"
                        ? "translate-y-0 opacity-100"
                        : "-translate-y-1 opacity-0 pointer-events-none",
                    )}
                  >
                    {selectedFilter === "game" ? (
                      <GameSubCategoryBar
                        selected={gameSubCategory}
                        onSelect={setGameSubCategory}
                      />
                    ) : selectedFilter === "sports" ? (
                      <SportsSubCategoryBar
                        selected={sportsSubCategory}
                        onSelect={setSportsSubCategory}
                      />
                    ) : selectedFilter === "stocks" ? (
                      <StocksSubCategoryBar
                        selected={stocksSubCategory}
                        onSelect={setStocksSubCategory}
                      />
                    ) : selectedFilter === "politics" ? (
                      <PoliticsSubCategoryBar
                        selected={politicsSubCategory}
                        onSelect={setPoliticsSubCategory}
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
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

          {/* split 모드: 기존 2컬럼 (베팅 + 게시판) */}
          {viewMode === "split" && (
            <>
              <section className="min-w-0 xl:col-start-2">
                {filteredMarkets.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5">
                    {filteredMarkets.map((market) => (
                      <MarketCard
                        key={market.id}
                        market={market}
                        onClick={() => router.push(`/market/${market.id}`)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="size-16 rounded-full bg-secondary flex items-center justify-center mb-4">
                      <span className="text-3xl text-muted-foreground">?</span>
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">
                      보트를 찾을 수 없습니다
                    </h3>
                    <p className="text-sm text-muted-foreground max-w-sm">
                      {searchQuery
                        ? `"${searchQuery}"에 해당하는 보트가 없습니다. 다른 검색어를 시도해보세요.`
                        : "이 카테고리에는 아직 보트가 없습니다."}
                    </p>
                  </div>
                )}
              </section>

              <aside className="lg:sticky lg:top-[88px] h-[560px] lg:h-[calc(100vh-120px)] xl:col-start-3">
                <CommunityBoard
                  activeFilter={selectedFilter}
                  searchQuery={searchQuery}
                  className="h-full"
                />
              </aside>
            </>
          )}

          {/* board 모드: 2:1 그리드 + 인기 베팅 사이드바 */}
          {viewMode === "board" && (
            <div
              className={cn(
                "min-w-0 xl:col-start-2 xl:col-end-4",
                "grid grid-cols-1 gap-8 lg:grid-cols-3 lg:items-start lg:gap-8",
              )}
            >
              <div
                className={cn(
                  "min-w-0 lg:col-span-2",
                  "w-full max-w-4xl mx-auto lg:mx-0",
                  "min-h-[560px] lg:min-h-[calc(100vh-120px)]",
                )}
              >
                <CommunityBoard
                  activeFilter={selectedFilter}
                  searchQuery={searchQuery}
                  className="h-full min-h-0"
                />
              </div>
              <aside
                className={cn(
                  "lg:col-span-1 w-full shrink-0",
                  "max-lg:max-w-xl max-lg:mx-auto",
                  "lg:sticky lg:top-[88px] lg:self-start",
                  "lg:max-h-[calc(100vh-120px)] lg:overflow-y-auto",
                )}
              >
                <TrendingBetsSidebar markets={trendingSidebarMarkets} />
              </aside>
            </div>
          )}

          {/* bets 모드: 2:1 그리드 + 인기 게시글 사이드바 */}
          {viewMode === "bets" && (
            <div
              className={cn(
                "min-w-0 xl:col-start-2 xl:col-end-4",
                "grid grid-cols-1 gap-8 lg:grid-cols-3 lg:items-start lg:gap-8",
              )}
            >
              <section className="min-w-0 lg:col-span-2">
                {filteredMarkets.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 md:gap-5">
                    {filteredMarkets.map((market) => (
                      <MarketCard
                        key={market.id}
                        market={market}
                        onClick={() => router.push(`/market/${market.id}`)}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="size-16 rounded-full bg-secondary flex items-center justify-center mb-4">
                      <span className="text-3xl text-muted-foreground">?</span>
                    </div>
                    <h3 className="text-lg font-semibold text-foreground mb-2">
                      보트를 찾을 수 없습니다
                    </h3>
                    <p className="text-sm text-muted-foreground max-w-sm">
                      {searchQuery
                        ? `"${searchQuery}"에 해당하는 보트가 없습니다. 다른 검색어를 시도해보세요.`
                        : "이 카테고리에는 아직 보트가 없습니다."}
                    </p>
                  </div>
                )}
              </section>
              <aside
                className={cn(
                  "hidden lg:block lg:col-span-1 w-full shrink-0",
                  "lg:sticky lg:top-20 lg:self-start",
                  "lg:max-h-[calc(100vh-5rem)] lg:overflow-y-auto",
                )}
              >
                <TrendingPostsSidebar />
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
    </div>
  );
}
