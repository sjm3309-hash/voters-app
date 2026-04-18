"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Sparkles } from "lucide-react";
import { MarketCard, MARKET_FEED_GRID_CLASS } from "@/components/market-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { parseFeedWireToMarket, type BetFeedMarketWire } from "@/lib/bets-feed-wire";
import { getMarketLifecyclePhase } from "@/lib/market-lifecycle";
import type { Market } from "@/components/market-card";
import type { MarketLifecyclePhase } from "@/lib/market-lifecycle";
import { cn } from "@/lib/utils";

type FilterTab = "all" | "active" | "waiting" | "completed";

const PHASE_SHORT: Record<MarketLifecyclePhase, string> = {
  active: "진행 중",
  waiting: "결과 대기 중",
  completed: "종료",
};

const PHASE_BADGE_CLASS: Record<MarketLifecyclePhase, string> = {
  active: "bg-emerald-500/15 text-emerald-600 border-emerald-500/30",
  waiting: "bg-amber-500/15 text-amber-600 border-amber-500/30",
  completed: "bg-secondary text-muted-foreground border-border/60",
};

type Props = {
  onNavigate?: () => void;
  active?: boolean;
  userId: string | null;
  className?: string;
  onMarketsLoaded?: (count: number) => void;
  /** 결과 대기 보트 수 콜백 (탭 배지용) */
  onWaitingCount?: (count: number) => void;
  variant?: "modal" | "page";
};

export function MyCreatedBetsList({
  onNavigate,
  active = true,
  userId,
  className,
  onMarketsLoaded,
  onWaitingCount,
  variant = "modal",
}: Props) {
  const router = useRouter();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<FilterTab>("all");

  const load = useCallback(async () => {
    if (!userId || userId === "anon") {
      setMarkets([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/my-created-bets", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        markets?: BetFeedMarketWire[];
        error?: string;
      };
      if (!res.ok || !j?.ok || !Array.isArray(j.markets)) {
        setError(j?.error ?? "목록을 불러오지 못했습니다.");
        setMarkets([]);
        onMarketsLoaded?.(0);
        return;
      }
      const mapped = j.markets.map(parseFeedWireToMarket);
      setMarkets(mapped);
      onMarketsLoaded?.(mapped.length);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
      setMarkets([]);
      onMarketsLoaded?.(0);
    } finally {
      setLoading(false);
    }
  }, [userId, onMarketsLoaded]);

  useEffect(() => {
    if (!active || !userId || userId === "anon") return;
    void load();
  }, [active, userId, load]);

  useEffect(() => {
    if (!active || !userId || userId === "anon") return;
    const onStale = () => void load();
    window.addEventListener("voters:feedBetsMaybeStale", onStale);
    return () => window.removeEventListener("voters:feedBetsMaybeStale", onStale);
  }, [active, userId, load]);

  // 상태별 분류
  const { activeList, waitingList, completedList } = useMemo(() => {
    const activeList: Market[] = [];
    const waitingList: Market[] = [];
    const completedList: Market[] = [];
    for (const m of markets) {
      const phase = getMarketLifecyclePhase(m.endsAt, {
        resultAt: m.resultAt,
        settled: Boolean(m.winningOptionId),
      });
      if (phase === "active") activeList.push(m);
      else if (phase === "waiting") waitingList.push(m);
      else completedList.push(m);
    }
    return { activeList, waitingList, completedList };
  }, [markets]);

  // 결과 대기 수 상위 컴포넌트에 전달
  useEffect(() => {
    onWaitingCount?.(waitingList.length);
  }, [waitingList.length, onWaitingCount]);

  const displayList = useMemo(() => {
    if (filterTab === "active") return activeList;
    if (filterTab === "waiting") return waitingList;
    if (filterTab === "completed") return completedList;
    return markets;
  }, [filterTab, markets, activeList, waitingList, completedList]);

  if (!userId || userId === "anon") {
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">로그인 후 확인할 수 있습니다.</p>
    );
  }

  if (loading && markets.length === 0) {
    return (
      <div className={cn("flex flex-col items-center justify-center gap-3 py-16", className)}>
        <Loader2 className="size-9 animate-spin text-chart-5" aria-hidden />
        <p className="text-sm text-muted-foreground">내 보트를 불러오는 중…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={cn("space-y-3 py-6 text-center", className)}>
        <p className="text-sm text-destructive">{error}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()}>
          다시 시도
        </Button>
      </div>
    );
  }

  if (markets.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-chart-5/30 bg-chart-5/5 px-6 py-14 text-center",
          className,
        )}
      >
        <Sparkles className="size-10 text-chart-5/80" aria-hidden />
        <p className="text-sm font-medium text-foreground">
          아직 내 보트가 없습니다. 첫 보트를 만들어보세요!
        </p>
        <Button
          type="button"
          className="font-semibold"
          style={{ background: "var(--chart-5)", color: "white" }}
          asChild
        >
          <Link href="/market/create" onClick={onNavigate}>
            보트 만들기
          </Link>
        </Button>
      </div>
    );
  }

  const scrollMax =
    variant === "page" ? "max-h-[min(75vh,52rem)]" : "max-h-[55vh]";

  return (
    <div className={cn("space-y-3", className)}>
      {/* 결과 입력 대기 알림 배너 */}
      {waitingList.length > 0 && (
        <div
          className="flex items-start gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 cursor-pointer"
          onClick={() => setFilterTab("waiting")}
        >
          <AlertTriangle className="size-4 shrink-0 text-amber-500 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">
              결과 입력이 필요한 보트 {waitingList.length}개
            </p>
            <p className="text-xs text-amber-600/80 dark:text-amber-500/80 mt-0.5">
              마감된 보트의 결과를 입력해주세요. 탭하면 해당 목록으로 이동합니다.
            </p>
          </div>
        </div>
      )}

      {/* 필터 탭 */}
      <div className="flex gap-1.5 flex-wrap">
        {(
          [
            { key: "all", label: "전체", count: markets.length },
            { key: "active", label: "진행 중", count: activeList.length },
            { key: "waiting", label: "결과 대기 중", count: waitingList.length },
            { key: "completed", label: "종료", count: completedList.length },
          ] as const
        ).map(({ key, label, count }) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilterTab(key)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
              filterTab === key
                ? "border-chart-5 bg-chart-5/15 text-chart-5"
                : "border-border/60 bg-secondary/30 text-muted-foreground hover:bg-secondary/60",
              key === "waiting" && count > 0 && filterTab !== key
                ? "border-amber-500/50 text-amber-600 bg-amber-500/10"
                : "",
            )}
          >
            {label}
            {count > 0 && <span className="ml-1 opacity-70">({count})</span>}
          </button>
        ))}
      </div>

      {/* 목록 */}
      {displayList.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          해당 상태의 보트가 없습니다.
        </p>
      ) : (
        <div
          className={cn(
            MARKET_FEED_GRID_CLASS,
            "overflow-auto py-2 pr-1",
            scrollMax,
          )}
        >
          {displayList.map((market) => {
            const phase = getMarketLifecyclePhase(market.endsAt, {
              resultAt: market.resultAt,
              settled: Boolean(market.winningOptionId),
            });
            const statusLabel = PHASE_SHORT[phase];
            const badgeClass = PHASE_BADGE_CLASS[phase];
            return (
              <div
                key={market.id}
                className="flex min-h-0 min-w-0 h-full flex-col rounded-xl border border-chart-5/20 bg-gradient-to-br from-chart-5/[0.07] to-transparent p-3 shadow-sm"
              >
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className="border-chart-5/40 bg-chart-5/10 text-[11px] font-bold text-chart-5"
                    >
                      내 보트
                    </Badge>
                    <Badge
                      variant="outline"
                      className={cn("text-[11px] font-semibold", badgeClass)}
                    >
                      {statusLabel}
                    </Badge>
                  </div>
                  <div className="text-sm font-bold tabular-nums text-foreground">
                    총 참여{" "}
                    <span className="text-chart-5">{market.totalPool.toLocaleString()} P</span>
                  </div>
                </div>
                <div className="min-h-0 min-w-0 flex-1">
                  <MarketCard
                    market={market}
                    className="h-full"
                    onClick={() => {
                      onNavigate?.();
                      router.push(`/market/${market.id}`);
                    }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
