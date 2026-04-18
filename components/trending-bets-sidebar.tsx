"use client";

import Link from "next/link";
import { Coins, Timer } from "lucide-react";
import type { Market } from "@/components/market-card";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

function formatTimeLeft(endsAt: Date): string {
  const ms = endsAt.getTime() - Date.now();
  if (ms <= 0) return "마감됨";
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  if (d > 0) return `남은 ${d}일 ${h}시간`;
  if (h > 0) return `남은 ${h}시간 ${m}분`;
  return `남은 ${m}분`;
}

export function TrendingBetsSidebar({
  markets,
  className,
  /** 목록 화면 복귀용 — 보트 상세에 `next` 로 전달 */
  listReturnUrl,
}: {
  markets: Market[];
  className?: string;
  listReturnUrl?: string;
}) {
  return (
    <Card
      className={cn(
        "border-border/60 bg-card/80 shadow-sm backdrop-blur-sm transition-shadow duration-300",
        className,
      )}
    >
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-bold leading-snug flex items-center gap-2">
          <span aria-hidden className="select-none">
            🔥
          </span>
          실시간 인기 보트
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {markets.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            표시할 보트가 없습니다
          </p>
        ) : (
          <ul className="space-y-2">
            {markets.map((m) => (
              <li key={m.id}>
                <Link
                  href={
                    listReturnUrl
                      ? `/market/${m.id}?${new URLSearchParams({ next: listReturnUrl }).toString()}`
                      : `/market/${m.id}`
                  }
                  className="block rounded-xl border border-border/50 bg-secondary/25 px-3 py-2.5 text-left transition-all duration-200 hover:border-chart-5/35 hover:bg-secondary/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chart-5/40"
                >
                  <p className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">
                    {m.question}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Coins className="size-3.5 shrink-0 text-chart-5/90" aria-hidden />
                      {m.totalPool.toLocaleString()} P
                    </span>
                    <span className="inline-flex items-center gap-1 tabular-nums">
                      <Timer className="size-3.5 shrink-0" aria-hidden />
                      {formatTimeLeft(m.endsAt)}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

