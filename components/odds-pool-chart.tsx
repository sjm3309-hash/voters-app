"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Trophy } from "lucide-react";
import { cn } from "@/lib/utils";
import { accentStroke, resolveOptionColor } from "@/lib/option-colors";

type Option = {
  id: string;
  label: string;
  percentage: number;
  color: string;
  /** 실제 베팅 페블 수량. 제공 시 percentage 역산 대신 이 값을 사용 */
  points?: number;
};

type Props = {
  options: Option[];
  totalPool: number;
  /** 정산 완료 시 당첨 선택지 ID — 제공 시 winner 강조 표시 */
  winningOptionId?: string;
  className?: string;
};

function formatCompactPoints(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${Math.round(value / 1_000)}K`;
  return value.toLocaleString();
}

function safeOdds(percentage: number): number {
  if (!Number.isFinite(percentage) || percentage <= 0) return 0;
  return Math.round((100 / percentage) * 100) / 100;
}

export function OddsPoolChart({ options, totalPool, winningOptionId, className }: Props) {
  const hasResult = Boolean(winningOptionId);

  const data = useMemo(() => {
    return options.map((o, idx) => {
      const pct = totalPool > 0 ? o.percentage : 0;
      const points = o.points !== undefined ? o.points : Math.round((totalPool * pct) / 100);
      const fillColor = resolveOptionColor(o.color, idx);
      const isWinner = hasResult && o.id === winningOptionId;
      const isLoser  = hasResult && o.id !== winningOptionId;
      return {
        id: o.id,
        label: o.label,
        percentage: pct,
        odds: safeOdds(pct),
        points,
        fillColor,
        strokeColor: accentStroke(fillColor),
        isWinner,
        isLoser,
      };
    });
  }, [options, totalPool, winningOptionId, hasResult]);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {hasResult ? "최종 페블 분포" : "투표 페블 분포"}
          </h3>
          <p className="text-xs text-muted-foreground">
            총 {formatCompactPoints(totalPool)}P 참여 (마우스 오버: 페블 + 예측 비율)
          </p>
        </div>
        {hasResult && (
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/25 rounded-full px-2.5 py-1">
            <Trophy className="size-3" />
            결과 확정
          </span>
        )}
      </div>

      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.3 0.02 260)" vertical={false} />
            <XAxis
              dataKey="label"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "oklch(0.6 0 0)", fontSize: 12 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "oklch(0.6 0 0)", fontSize: 12 }}
              tickFormatter={(v) => `${formatCompactPoints(v)}P`}
              width={64}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as (typeof data)[number];
                return (
                  <div className="bg-popover border border-border rounded-lg p-3 shadow-xl">
                    <div className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                      {p.isWinner && <Trophy className="size-3.5 text-amber-400" />}
                      {p.label}
                      {p.isWinner && <span className="text-xs text-amber-500 font-bold ml-1">당첨</span>}
                    </div>
                    <div className="mt-1 text-sm font-semibold" style={{ color: p.fillColor }}>
                      페블: {p.points.toLocaleString()} P
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      예측 비율: <span className="font-semibold text-foreground">{p.odds}x</span>
                    </div>
                  </div>
                );
              }}
            />
            <Bar dataKey="points" radius={[8, 8, 0, 0]}>
              {data.map((entry) => (
                <Cell
                  key={entry.id}
                  fill={entry.fillColor}
                  stroke={entry.isWinner ? entry.fillColor : entry.strokeColor}
                  strokeWidth={entry.isWinner ? 2 : 1}
                  opacity={entry.isLoser ? 0.35 : 1}
                  className="transition-all duration-300"
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 옵션별 비율 게이지 */}
      <div className="space-y-3 pt-1">
        {data.map((row) => (
          <div
            key={row.id}
            className={cn(
              "space-y-1 rounded-lg px-2 py-1.5 transition-all duration-200",
              row.isWinner && "bg-amber-500/[0.07] border border-amber-500/25",
              row.isLoser  && "opacity-40",
            )}
          >
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className={cn("font-medium text-foreground truncate flex items-center gap-1", row.isWinner && "font-bold")}>
                {row.isWinner && <Trophy className="size-3 text-amber-400 shrink-0" />}
                {row.label}
                {row.isWinner && (
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-bold ml-0.5">당첨</span>
                )}
              </span>
              <span className={cn("tabular-nums font-semibold shrink-0", row.isWinner && "font-bold")} style={{ color: row.fillColor }}>
                {row.percentage}%
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-secondary/80 overflow-hidden border border-border/40">
              <div
                className="h-full rounded-full transition-all duration-300 ease-out"
                style={{
                  width: `${Math.min(100, Math.max(0, row.percentage))}%`,
                  backgroundColor: row.fillColor,
                  boxShadow: row.isWinner ? `0 0 8px color-mix(in srgb, ${row.fillColor} 70%, transparent)` : undefined,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

