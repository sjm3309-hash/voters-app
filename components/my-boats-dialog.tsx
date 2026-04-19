"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Copy,
  Loader2,
  Sparkles,
  Trophy,
  Vote,
  Plus,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MarketCard, MARKET_FEED_GRID_CLASS } from "@/components/market-card";
import { parseFeedWireToMarket, type BetFeedMarketWire } from "@/lib/bets-feed-wire";
import { getMarketLifecyclePhase } from "@/lib/market-lifecycle";
import type { Market } from "@/components/market-card";
import type { MarketLifecyclePhase } from "@/lib/market-lifecycle";
import { cn } from "@/lib/utils";

type FilterTab = "all" | "active" | "waiting" | "completed";
type BoatTab = "participated" | "created";

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

type ParticipatedMarket = Market & { myStake?: number };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
};

// ─── 상태 필터 탭 ─────────────────────────────────────────────────────────────
function StatusFilter({
  filterTab,
  setFilterTab,
  counts,
}: {
  filterTab: FilterTab;
  setFilterTab: (t: FilterTab) => void;
  counts: { all: number; active: number; waiting: number; completed: number };
}) {
  const items = [
    { key: "all" as const, label: "전체", count: counts.all },
    { key: "active" as const, label: "진행 중", count: counts.active },
    { key: "waiting" as const, label: "결과 대기", count: counts.waiting },
    { key: "completed" as const, label: "종료", count: counts.completed },
  ];
  return (
    <div className="flex gap-1.5 flex-wrap">
      {items.map(({ key, label, count }) => (
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
  );
}

// ─── 참가 보트 목록 ───────────────────────────────────────────────────────────
function ParticipatedBetsList({
  userId,
  active,
  onClose,
}: {
  userId: string | null;
  active: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [markets, setMarkets] = useState<ParticipatedMarket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<FilterTab>("all");

  const load = useCallback(async () => {
    if (!userId || userId === "anon") { setMarkets([]); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/my-participated-bets", { credentials: "same-origin", cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean; markets?: (BetFeedMarketWire & { myStake?: number })[]; error?: string;
      };
      if (!res.ok || !j?.ok || !Array.isArray(j.markets)) {
        setError(j?.error ?? "목록을 불러오지 못했습니다.");
        setMarkets([]);
        return;
      }
      setMarkets(j.markets.map((w) => ({ ...parseFeedWireToMarket(w), myStake: w.myStake ?? 0 })));
    } catch {
      setError("네트워크 오류가 발생했습니다.");
      setMarkets([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => { if (active && userId && userId !== "anon") void load(); }, [active, userId, load]);

  const { activeList, waitingList, completedList } = useMemo(() => {
    const a: ParticipatedMarket[] = [], w: ParticipatedMarket[] = [], c: ParticipatedMarket[] = [];
    for (const m of markets) {
      const phase = getMarketLifecyclePhase(m.endsAt, { resultAt: m.resultAt, settled: Boolean(m.winningOptionId) });
      if (phase === "active") a.push(m);
      else if (phase === "waiting") w.push(m);
      else c.push(m);
    }
    return { activeList: a, waitingList: w, completedList: c };
  }, [markets]);

  const displayList = useMemo(() => {
    if (filterTab === "active") return activeList;
    if (filterTab === "waiting") return waitingList;
    if (filterTab === "completed") return completedList;
    return markets;
  }, [filterTab, markets, activeList, waitingList, completedList]);

  if (!userId || userId === "anon") {
    return <p className="py-10 text-center text-sm text-muted-foreground">로그인 후 확인할 수 있습니다.</p>;
  }
  if (loading && markets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <Loader2 className="size-8 animate-spin text-chart-5" aria-hidden />
        <p className="text-sm text-muted-foreground">참가 보트를 불러오는 중…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-3 py-6 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()}>다시 시도</Button>
      </div>
    );
  }
  if (markets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-chart-5/30 bg-chart-5/5 px-6 py-14 text-center">
        <Trophy className="size-10 text-chart-5/60" aria-hidden />
        <div>
          <p className="text-sm font-semibold text-foreground">아직 참가한 보트가 없습니다</p>
          <p className="mt-1 text-xs text-muted-foreground">보트에 참여해 페블을 모아보세요!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <StatusFilter
        filterTab={filterTab}
        setFilterTab={setFilterTab}
        counts={{ all: markets.length, active: activeList.length, waiting: waitingList.length, completed: completedList.length }}
      />
      {displayList.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">해당 상태의 보트가 없습니다.</p>
      ) : (
        <div className={cn(MARKET_FEED_GRID_CLASS, "overflow-auto py-2 pr-1 max-h-[50vh]")}>
          {displayList.map((market) => {
            const phase = getMarketLifecyclePhase(market.endsAt, { resultAt: market.resultAt, settled: Boolean(market.winningOptionId) });
            return (
              <div key={market.id} className="flex min-h-0 min-w-0 h-full flex-col rounded-xl border border-emerald-500/20 bg-gradient-to-br from-emerald-500/[0.06] to-transparent p-3 shadow-sm">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-[11px] font-bold text-emerald-600">참가</Badge>
                    <Badge variant="outline" className={cn("text-[11px] font-semibold", PHASE_BADGE_CLASS[phase])}>{PHASE_SHORT[phase]}</Badge>
                  </div>
                  {(market.myStake ?? 0) > 0 && (
                    <span className="text-xs font-bold tabular-nums text-foreground">
                      내 참여 <span className="text-chart-5">{market.myStake!.toLocaleString()} P</span>
                    </span>
                  )}
                </div>
                <div className="min-h-0 min-w-0 flex-1">
                  <MarketCard market={market} className="h-full" onClick={() => { router.push(`/market/${market.id}`); }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── 내가 만든 보트 목록 ──────────────────────────────────────────────────────
function CreatedBetsList({
  userId,
  active,
  onClose,
}: {
  userId: string | null;
  active: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [wireData, setWireData] = useState<BetFeedMarketWire[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<FilterTab>("all");

  const load = useCallback(async () => {
    if (!userId || userId === "anon") { setMarkets([]); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/my-created-bets", { credentials: "same-origin", cache: "no-store" });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; markets?: BetFeedMarketWire[]; error?: string; };
      if (!res.ok || !j?.ok || !Array.isArray(j.markets)) {
        setError(j?.error ?? "목록을 불러오지 못했습니다.");
        setMarkets([]);
        return;
      }
      setMarkets(j.markets.map(parseFeedWireToMarket));
      setWireData(j.markets);
    } catch {
      setError("네트워크 오류가 발생했습니다.");
      setMarkets([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  const buildCloneUrl = (market: Market) => {
    const wire = wireData.find((w) => w.id === market.id);
    const params = new URLSearchParams();
    params.set("q", market.question);
    if (wire?.description) params.set("desc", wire.description);
    if (wire?.resolver)    params.set("resolver", wire.resolver);
    params.set("cat", market.category);
    if (market.subCategory) params.set("sub", market.subCategory);
    const opts = market.options.map((o) => ({ label: o.label, color: o.color }));
    params.set("opts", encodeURIComponent(JSON.stringify(opts)));
    params.set("endsAt", market.endsAt.toISOString());
    const resultIso = wire?.resultAt ?? (market.resultAt ? market.resultAt.toISOString() : "");
    if (resultIso) params.set("resultAt", resultIso);
    return `/market/create?${params.toString()}`;
  };

  useEffect(() => { if (active && userId && userId !== "anon") void load(); }, [active, userId, load]);

  useEffect(() => {
    if (!active || !userId || userId === "anon") return;
    const onStale = () => void load();
    window.addEventListener("voters:feedBetsMaybeStale", onStale);
    return () => window.removeEventListener("voters:feedBetsMaybeStale", onStale);
  }, [active, userId, load]);

  const { activeList, waitingList, completedList } = useMemo(() => {
    const a: Market[] = [], w: Market[] = [], c: Market[] = [];
    for (const m of markets) {
      const phase = getMarketLifecyclePhase(m.endsAt, { resultAt: m.resultAt, settled: Boolean(m.winningOptionId) });
      if (phase === "active") a.push(m);
      else if (phase === "waiting") w.push(m);
      else c.push(m);
    }
    return { activeList: a, waitingList: w, completedList: c };
  }, [markets]);

  const displayList = useMemo(() => {
    if (filterTab === "active") return activeList;
    if (filterTab === "waiting") return waitingList;
    if (filterTab === "completed") return completedList;
    return markets;
  }, [filterTab, markets, activeList, waitingList, completedList]);

  if (!userId || userId === "anon") {
    return <p className="py-10 text-center text-sm text-muted-foreground">로그인 후 확인할 수 있습니다.</p>;
  }
  if (loading && markets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <Loader2 className="size-8 animate-spin text-chart-5" aria-hidden />
        <p className="text-sm text-muted-foreground">내 보트를 불러오는 중…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-3 py-6 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()}>다시 시도</Button>
      </div>
    );
  }
  if (markets.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-chart-5/30 bg-chart-5/5 px-6 py-14 text-center">
        <Sparkles className="size-10 text-chart-5/60" aria-hidden />
        <div>
          <p className="text-sm font-semibold text-foreground">아직 만든 보트가 없습니다</p>
          <p className="mt-1 text-xs text-muted-foreground">첫 보트를 만들어보세요!</p>
        </div>
        <Button
          type="button"
          size="sm"
          className="gap-1.5 font-semibold"
          style={{ background: "var(--chart-5)", color: "white" }}
          onClick={() => { onClose(); router.push("/market/create"); }}
        >
          <Plus className="size-3.5" aria-hidden />
          보트 만들기
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {waitingList.length > 0 && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 cursor-pointer" onClick={() => setFilterTab("waiting")}>
          <AlertTriangle className="size-4 shrink-0 text-amber-500 mt-0.5" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-400">결과 입력이 필요한 보트 {waitingList.length}개</p>
            <p className="text-xs text-amber-600/80 dark:text-amber-500/80 mt-0.5">마감된 보트의 결과를 입력해주세요.</p>
          </div>
        </div>
      )}
      <StatusFilter
        filterTab={filterTab}
        setFilterTab={setFilterTab}
        counts={{ all: markets.length, active: activeList.length, waiting: waitingList.length, completed: completedList.length }}
      />
      {displayList.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">해당 상태의 보트가 없습니다.</p>
      ) : (
        <div className={cn(MARKET_FEED_GRID_CLASS, "overflow-auto py-2 pr-1 max-h-[50vh]")}>
          {displayList.map((market) => {
            const phase = getMarketLifecyclePhase(market.endsAt, { resultAt: market.resultAt, settled: Boolean(market.winningOptionId) });
            return (
              <div key={market.id} className="flex min-h-0 min-w-0 h-full flex-col rounded-xl border border-chart-5/20 bg-gradient-to-br from-chart-5/[0.07] to-transparent p-3 shadow-sm">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline" className="border-chart-5/40 bg-chart-5/10 text-[11px] font-bold text-chart-5">내 보트</Badge>
                    <Badge variant="outline" className={cn("text-[11px] font-semibold", PHASE_BADGE_CLASS[phase])}>{PHASE_SHORT[phase]}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="text-xs font-bold tabular-nums text-foreground">
                      총 참여 <span className="text-chart-5">{market.totalPool.toLocaleString()} P</span>
                    </div>
                    <button
                      type="button"
                      title="보트 복제하기"
                      onClick={(e) => {
                        e.stopPropagation();
                        router.push(buildCloneUrl(market));
                      }}
                      className="flex items-center gap-1 rounded-lg border border-border/60 bg-secondary/40 px-2 py-1 text-[11px] font-semibold text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
                    >
                      <Copy className="size-3" />
                      복제
                    </button>
                  </div>
                </div>
                <div className="min-h-0 min-w-0 flex-1">
                  <MarketCard market={market} className="h-full" onClick={() => { router.push(`/market/${market.id}`); }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── My 보트 다이얼로그 ───────────────────────────────────────────────────────
export function MyBoatsDialog({ open, onOpenChange, userId }: Props) {
  const [boatTab, setBoatTab] = useState<BoatTab>("participated");

  const BOAT_TABS: { key: BoatTab; label: string; sub: string; icon: React.ElementType; accent: string; bg: string }[] = [
    {
      key: "participated",
      label: "참가 보트",
      sub: "내가 참여한 보트",
      icon: Trophy,
      accent: "text-emerald-600 dark:text-emerald-400",
      bg: "from-emerald-500/15 to-emerald-500/5 border-emerald-500/30",
    },
    {
      key: "created",
      label: "내가 만든 보트",
      sub: "직접 개설한 보트",
      icon: Vote,
      accent: "text-chart-5",
      bg: "from-chart-5/15 to-chart-5/5 border-chart-5/30",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[92vh] flex flex-col gap-0 p-0 overflow-hidden rounded-2xl">
        {/* ── 헤더 영역 ── */}
        <div className="relative overflow-hidden shrink-0 bg-gradient-to-br from-chart-5/20 via-chart-5/10 to-transparent px-5 pt-5 pb-4 border-b border-border/40">
          {/* 배경 장식 */}
          <div className="pointer-events-none absolute -right-6 -top-6 size-32 rounded-full bg-chart-5/10 blur-2xl" />
          <div className="pointer-events-none absolute right-16 top-2 size-16 rounded-full bg-purple-400/10 blur-xl" />

          <div className="relative flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-chart-5/20 border border-chart-5/30">
              <Vote className="size-5 text-chart-5" strokeWidth={2.5} aria-hidden />
            </div>
            <div>
              <DialogTitle className="text-base font-black tracking-tight text-foreground sm:text-lg">
                My 보트
              </DialogTitle>
              <p className="text-[11px] text-muted-foreground mt-0.5">나의 참여 활동을 한눈에 확인하세요</p>
            </div>
          </div>

          {/* 카테고리 카드 탭 */}
          <div className="relative mt-4 grid grid-cols-2 gap-2">
            {BOAT_TABS.map(({ key, label, sub, icon: Icon, accent, bg }) => {
              const isActive = boatTab === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setBoatTab(key)}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-xl border bg-gradient-to-br px-4 py-3 text-left transition-all duration-200",
                    isActive
                      ? cn(bg, "shadow-sm ring-1 ring-inset", key === "participated" ? "ring-emerald-500/20" : "ring-chart-5/20")
                      : "border-border/50 bg-secondary/20 hover:bg-secondary/40",
                  )}
                >
                  <div className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                    isActive ? (key === "participated" ? "bg-emerald-500/20" : "bg-chart-5/20") : "bg-secondary/60 group-hover:bg-secondary",
                  )}>
                    <Icon className={cn("size-4", isActive ? accent : "text-muted-foreground")} aria-hidden />
                  </div>
                  <div className="min-w-0">
                    <p className={cn("text-sm font-bold leading-none", isActive ? accent : "text-foreground")}>{label}</p>
                    <p className="mt-1 text-[11px] text-muted-foreground truncate">{sub}</p>
                  </div>
                  {isActive && (
                    <span className={cn(
                      "absolute bottom-0 left-0 right-0 h-0.5 rounded-b-xl",
                      key === "participated" ? "bg-emerald-500" : "bg-chart-5",
                    )} />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── 콘텐츠 영역 ── */}
        <div className="flex-1 overflow-auto px-5 py-4 min-h-0">
          {boatTab === "participated" ? (
            <ParticipatedBetsList
              userId={userId}
              active={open && boatTab === "participated"}
              onClose={() => onOpenChange(false)}
            />
          ) : (
            <CreatedBetsList
              userId={userId}
              active={open && boatTab === "created"}
              onClose={() => onOpenChange(false)}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
