"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles } from "lucide-react";
import { MarketCard, MARKET_FEED_GRID_CLASS } from "@/components/market-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { parseFeedWireToMarket, type BetFeedMarketWire } from "@/lib/bets-feed-wire";
import { getMarketLifecyclePhase } from "@/lib/market-lifecycle";
import type { Market } from "@/components/market-card";
import type { MarketLifecyclePhase } from "@/lib/market-lifecycle";
import { cn } from "@/lib/utils";

const PHASE_SHORT: Record<MarketLifecyclePhase, string> = {
  active: "진행 중",
  waiting: "대기 중",
  completed: "종료",
};

type Props = {
  /** 네비게이션 클릭 시 모달 닫기 등 */
  onNavigate?: () => void;
  /** 외부에서 목록 갱신 트리거 (탭 진입 시 true) */
  active?: boolean;
  userId: string | null;
  className?: string;
  /** 목록 로드 후 개수 (탭 배지용) */
  onMarketsLoaded?: (count: number) => void;
  /** 프로필 전용 페이지에서는 스크롤 영역을 더 높게 */
  variant?: "modal" | "page";
};

export function MyCreatedBetsList({
  onNavigate,
  active = true,
  userId,
  className,
  onMarketsLoaded,
  variant = "modal",
}: Props) {
  const router = useRouter();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    <div
      className={cn(
        MARKET_FEED_GRID_CLASS,
        "overflow-auto py-2 pr-1",
        scrollMax,
        className,
      )}
    >
      {markets.map((market) => {
        const phase = getMarketLifecyclePhase(market.endsAt, {
          resultAt: market.resultAt,
          settled: Boolean(market.winningOptionId),
        });
        const statusLabel = PHASE_SHORT[phase];
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
                <Badge className="bg-secondary text-foreground text-[11px] font-semibold">
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
  );
}
