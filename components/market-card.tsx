"use client";

import { useEffect, useMemo, useState } from "react";
import { useClock } from "@/lib/clock-context";
import { cn } from "@/lib/utils";
import { CheckCircle2, Clock, Eye, ThumbsUp, MessageCircle, Trophy } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CategoryId } from "./category-filter";
import { getLikeCount, hasLiked, toggleLike } from "@/lib/likes";
import { loadAuthUser } from "@/lib/auth";
import { getMarketViews } from "@/lib/market-views";
import {
  getMarketLifecyclePhase,
  type MarketLifecyclePhase,
} from "@/lib/market-lifecycle";
import { normalizeHex6 } from "@/lib/option-colors";

export interface MarketOption {
  id: string;
  label: string;
  percentage: number;
  color: string;
}

export interface Market {
  id: string;
  question: string;
  category: Exclude<CategoryId, "all">;
  options: MarketOption[];
  totalPool: number;
  comments: number;
  endsAt: Date;
  createdAt?: Date;
  participants?: number;
  /** 결과 확정(발표) 예정 시각 — 없으면 마감 후 ‘결과 대기’만 표시 */
  resultAt?: Date;
  /** 정산(적중 결과) 완료 시 완료 상태로 고정 */
  winningOptionId?: string;
  /** 카테고리 세부 탭 필터용 (예: game=lol, sports=football) */
  subCategory?: string;
  /** DB sub_category 표시용(예: "LoL") */
  subCategoryLabel?: string;
  /** DB의 bets.color에서 전달되는 강조색 */
  accentColor?: string;
  /** 자동 생성(운영자) 보트 표시용 */
  isOfficial?: boolean;
  officialAuthorName?: string;
}

interface MarketCardProps {
  market: Market;
  onClick?: () => void;
  /** 그리드 셀 안에서 높이·폭 맞춤 등 */
  className?: string;
}

/** 메인·프로필 등 보트 카드 나열 — 카드 최소 폭 300px 유지 후 남는 폭 균등·줄바꿈 */
export const MARKET_FEED_GRID_CLASS =
  "grid w-full grid-flow-row items-stretch gap-5 [grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr))]";

const categoryLabels: Record<Exclude<CategoryId, "all">, string> = {
  crypto: "크립토",
  stocks: "주식",
  politics: "정치",
  fun: "재미",
  game: "게임",
  sports: "스포츠",
};

const categoryColors: Record<Exclude<CategoryId, "all">, string> = {
  crypto: "bg-chart-4/20 text-chart-4 border-chart-4/30",
  stocks: "bg-neon-blue/20 text-neon-blue border-neon-blue/30",
  politics: "bg-chart-5/20 text-chart-5 border-chart-5/30",
  fun: "bg-chart-3/20 text-chart-3 border-chart-3/30",
  game: "bg-chart-2/20 text-chart-2 border-chart-2/30",
  sports: "bg-neon-green/20 text-neon-green border-neon-green/30",
};

function formatPool(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${Math.floor(value / 1000).toLocaleString()}K`;
  }
  return value.toLocaleString();
}

function getTimeRemaining(date: Date): string {
  const now = new Date();
  const diff = date.getTime() - now.getTime();

  if (diff <= 0) return "종료됨";

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 0) return `${days}일 ${hours}시간 남음`;
  return `${hours}시간 남음`;
}

function timeUntil(date: Date, now: Date): string {
  const diff = date.getTime() - now.getTime();
  if (diff <= 0) return "곧 마감";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  if (days > 0) return `${days}일 ${hours}시간 후 확정 예정`;
  const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}시간 ${m}분 후 확정 예정`;
  return `${m}분 후 확정 예정`;
}

/** 카드 헤더 한 줄용 — 긴 설명은 `title`로 노출 */
function getTimeRemainingCompact(date: Date): string {
  const now = new Date();
  const diff = date.getTime() - now.getTime();
  if (diff <= 0) return "종료";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (days > 0) return `${days}일 ${hours}시간`;
  if (hours > 0) return `${hours}시간`;
  return `${minutes}분`;
}

function timeUntilCompact(date: Date, now: Date): string {
  const diff = date.getTime() - now.getTime();
  if (diff <= 0) return "곧";
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (days > 0) return `${days}일 ${hours}시간`;
  if (hours > 0) return `${hours}시간 ${m}분`;
  return `${m}분`;
}

const PHASE_LABEL: Record<MarketLifecyclePhase, string> = {
  active: "진행 중",
  waiting: "결과 대기 중",
  completed: "결과 확정",
};

function phaseStyles(phase: MarketLifecyclePhase): {
  card: string;
  badge: string;
  clock: string;
} {
  switch (phase) {
    case "active":
      return {
        card:
          "border-chart-5/35 bg-card shadow-sm shadow-chart-5/5 hover:border-chart-5/55 hover:shadow-chart-5/15",
        badge:
          "border-0 bg-chart-5 text-primary-foreground shadow-sm shadow-chart-5/25",
        clock: "text-muted-foreground",
      };
    case "waiting":
      return {
        card:
          "border-orange-500/55 bg-orange-500/[0.07] dark:bg-orange-950/25 hover:border-orange-500/75 hover:bg-orange-500/10 dark:hover:bg-orange-950/35 shadow-sm shadow-orange-500/10",
        badge: "border-0 bg-orange-500 text-white shadow-sm shadow-orange-500/30",
        clock: "text-orange-700 dark:text-orange-300/95 font-medium",
      };
    case "completed":
      return {
        card:
          "border-amber-500/30 bg-amber-500/[0.04] hover:border-amber-500/50 hover:bg-amber-500/[0.07]",
        badge: "border-0 bg-amber-500 text-white grayscale-0 opacity-100",
        clock: "text-amber-600 dark:text-amber-400/90 grayscale-0",
      };
    default:
      return { card: "", badge: "", clock: "" };
  }
}

export function MarketCard({ market, onClick, className }: MarketCardProps) {
  const winningOption = market.winningOptionId
    ? market.options.find((o) => o.id === market.winningOptionId)
    : undefined;
  const userId = loadAuthUser()?.name?.trim() || "anon";
  const target = useMemo(() => ({ type: "market" as const, id: market.id }), [market.id]);
  const [likeCount, setLikeCount] = useState<number>(0);
  const [liked, setLiked] = useState<boolean>(false);
  const [viewCount, setViewCount] = useState<number>(0);
  const now = useClock();

  useEffect(() => {
    setLikeCount(getLikeCount(target));
    setLiked(hasLiked(target, userId));
  }, [target, userId]);

  useEffect(() => {
    setViewCount(getMarketViews(market.id));
    const onViews = () => setViewCount(getMarketViews(market.id));
    window.addEventListener("voters:marketViewsUpdated", onViews as EventListener);
    window.addEventListener("storage", onViews as EventListener);
    return () => {
      window.removeEventListener("voters:marketViewsUpdated", onViews as EventListener);
      window.removeEventListener("storage", onViews as EventListener);
    };
  }, [market.id]);

  useEffect(() => {
    const onLikesUpdated = () => {
      setLikeCount(getLikeCount(target));
      setLiked(hasLiked(target, userId));
    };
    window.addEventListener("voters:likesUpdated", onLikesUpdated as EventListener);
    window.addEventListener("storage", onLikesUpdated as EventListener);
    return () => {
      window.removeEventListener("voters:likesUpdated", onLikesUpdated as EventListener);
      window.removeEventListener("storage", onLikesUpdated as EventListener);
    };
  }, [target, userId]);

  const phase = useMemo(
    () =>
      getMarketLifecyclePhase(market.endsAt, {
        now,
        resultAt: market.resultAt,
        settled: Boolean(market.winningOptionId),
      }),
    [market.endsAt, market.resultAt, market.winningOptionId, now],
  );
  const styles = phaseStyles(phase);
  const accent = market.accentColor?.trim() || undefined;

  const clockLabelFull =
    phase === "active"
      ? getTimeRemaining(market.endsAt)
      : phase === "waiting" && market.resultAt
        ? timeUntil(market.resultAt, now)
        : phase === "waiting"
          ? "결과 일정 대기"
          : "종료";

  const clockLabelShort =
    phase === "active"
      ? getTimeRemainingCompact(market.endsAt)
      : phase === "waiting" && market.resultAt
        ? timeUntilCompact(market.resultAt, now)
        : phase === "waiting"
          ? "일정 대기"
          : "종료";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex min-h-[260px] w-full min-w-0 flex-col text-left p-4 md:p-5 rounded-xl border overflow-hidden transition-all duration-300",
        "hover:shadow-lg",
        styles.card,
        phase === "active" && "hover:bg-surface-elevated/80",
        className,
      )}
      style={
        accent
          ? {
              borderColor:
                phase === "active"
                  ? `color-mix(in oklch, ${accent} 55%, transparent)`
                  : phase === "waiting"
                    ? `color-mix(in oklch, ${accent} 35%, transparent)`
                    : undefined,
              boxShadow:
                phase === "active"
                  ? `0 10px 30px -18px color-mix(in oklch, ${accent} 35%, transparent)`
                  : phase === "completed"
                    ? "0 2px 12px -4px color-mix(in oklch, oklch(0.7 0.15 85) 20%, transparent)"
                    : undefined,
            }
          : phase === "completed"
            ? { boxShadow: "0 2px 12px -4px color-mix(in oklch, oklch(0.7 0.15 85) 15%, transparent)" }
            : undefined
      }
    >
      {phase === "completed" && (
        <div
          className="-mt-4 md:-mt-5 -mx-4 md:-mx-5 mb-3 h-1.5 rounded-t-xl opacity-80"
          style={{ background: "linear-gradient(90deg, #f59e0b, #f97316 60%, #eab308)" }}
          aria-hidden="true"
        />
      )}
      {accent && phase !== "completed" && (
        <div
          className={cn(
            "-mt-4 md:-mt-5 -mx-4 md:-mx-5 mb-3 h-1.5 rounded-t-xl opacity-90 transition-opacity duration-300",
            phase === "waiting" && "opacity-70",
          )}
          style={{ backgroundColor: accent }}
          aria-hidden="true"
        />
      )}
      <div className="flex min-w-0 flex-col gap-2.5 mb-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <Badge
            variant="outline"
            className={cn(
              "text-xs font-medium shrink-0",
              categoryColors[market.category],
              phase === "completed" && "opacity-95",
            )}
          >
            {categoryLabels[market.category]}
          </Badge>
          {market.subCategoryLabel && market.subCategoryLabel !== "기타" && (
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] font-bold px-2 py-0.5 shrink-0 border-border/60 bg-secondary/40 text-foreground/90",
                phase === "completed" && "opacity-90",
              )}
              title={`세부 카테고리: ${market.subCategoryLabel}`}
            >
              {market.subCategoryLabel}
            </Badge>
          )}
          {market.isOfficial && (
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold",
                "bg-chart-5/10 text-chart-5 border-chart-5/25",
                phase === "completed" && "opacity-90",
              )}
              title={market.officialAuthorName ?? "VOTERS 운영자"}
            >
              <CheckCircle2 className="size-3" aria-hidden />
              운영자
            </span>
          )}
          <Badge
            className={cn(
              "inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 shrink-0",
              styles.badge,
            )}
          >
            {phase === "completed" && <Trophy className="size-3" aria-hidden />}
            {PHASE_LABEL[phase]}
          </Badge>
          {phase === "completed" && winningOption && (
            <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/25 px-2 py-0.5 rounded-full shrink-0 truncate max-w-[120px]">
              🏆 {winningOption.label}
            </span>
          )}
        </div>
        <div
          className={cn(
            "flex items-center gap-1.5 text-xs tabular-nums shrink-0",
            styles.clock,
          )}
          title={clockLabelFull}
        >
          <Clock className="size-3.5 opacity-80" aria-hidden />
          <span>{clockLabelShort}</span>
        </div>
      </div>

      <h3
        className={cn(
          "text-base md:text-lg font-semibold leading-snug mb-4 line-clamp-2 transition-colors text-balance",
          phase === "active" && "text-foreground group-hover:text-neon-blue",
          phase === "waiting" && "text-foreground",
          phase === "completed" && "text-muted-foreground group-hover:text-foreground/90",
        )}
      >
        {market.question}
      </h3>

      <div className="mb-4 min-h-0 flex-1 space-y-2.5">
        {market.options.map((option) => {
          const pct = market.totalPool > 0 ? option.percentage : 0;
          const barColor = normalizeHex6(option.color) ?? option.color;
          const isWinner = phase === "completed" && option.id === market.winningOptionId;
          const isLoser  = phase === "completed" && market.winningOptionId && option.id !== market.winningOptionId;
          return (
            <div key={option.id} className={cn("min-w-0 space-y-1", isLoser && "opacity-40")}>
              <div className="flex min-w-0 items-center justify-between gap-2 text-sm">
                <span className={cn("min-w-0 truncate font-medium", isWinner ? "text-foreground font-bold" : "text-foreground")}>
                  {isWinner && <Trophy className="inline size-3 mr-1 text-amber-400" aria-hidden />}
                  {option.label}
                </span>
                <span
                  className={cn("font-semibold tabular-nums shrink-0", isWinner && "font-bold")}
                  style={{ color: barColor }}
                >
                  {pct}%
                </span>
              </div>
              <div className="relative h-2 rounded-full overflow-hidden bg-secondary ring-1 ring-inset ring-border/40">
                <div
                  className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: barColor,
                    boxShadow: isWinner
                      ? `inset 0 0 0 1px color-mix(in srgb, ${barColor} 50%, transparent), 0 0 6px color-mix(in srgb, ${barColor} 60%, transparent)`
                      : `inset 0 0 0 1px color-mix(in srgb, ${barColor} 35%, transparent)`,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div
        className={cn(
          "mt-auto flex items-center justify-between text-xs text-muted-foreground pt-3 border-t",
          phase === "waiting" ? "border-orange-500/25" : "border-border/50",
          phase === "completed" && "border-amber-500/20",
        )}
      >
        <span className="font-medium text-foreground">
          총 페블: {formatPool(market.totalPool)} P
        </span>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <Eye className="size-3.5" />
            <span>{viewCount}</span>
          </div>
          <span
            role="button"
            tabIndex={0}
            className={cn(
              "inline-flex items-center gap-1 rounded-md px-2 py-1 transition-colors",
              liked ? "bg-neon-red/10 text-neon-red" : "hover:bg-secondary"
            )}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const next = toggleLike(target, userId);
              setLikeCount(next.count);
              setLiked(next.liked);
            }}
            onKeyDown={(e) => {
              if (e.key !== "Enter" && e.key !== " ") return;
              e.preventDefault();
              e.stopPropagation();
              const next = toggleLike(target, userId);
              setLikeCount(next.count);
              setLiked(next.liked);
            }}
            aria-label="좋아요"
            title="좋아요"
          >
            <ThumbsUp className={cn("size-3.5", liked ? "fill-current" : "")} />
            <span>{likeCount}</span>
          </span>
          <div className="flex items-center gap-1">
            <MessageCircle className="size-3.5" />
            <span>{market.comments}</span>
          </div>
        </div>
      </div>
    </button>
  );
}
