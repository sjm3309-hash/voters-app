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
import { cn } from "@/lib/utils";
import { accentStroke, resolveOptionColor } from "@/lib/option-colors";

type Option = {
  id: string;
  label: string;
  percentage: number;
  color: string;
};

type Props = {
  options: Option[];
  totalPool: number;
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

export function OddsPoolChart({ options, totalPool, className }: Props) {
  const data = useMemo(() => {
    return options.map((o, idx) => {
      const pct = totalPool > 0 ? o.percentage : 0;
      const points = Math.round((totalPool * pct) / 100);
      const fillColor = resolveOptionColor(o.color, idx);
      return {
        id: o.id,
        label: o.label,
        percentage: pct,
        odds: safeOdds(pct),
        points,
        fillColor,
        strokeColor: accentStroke(fillColor),
      };
    });
  }, [options, totalPool]);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">투표 페블 분포</h3>
          <p className="text-xs text-muted-foreground">
            총 {formatCompactPoints(totalPool)}P 참여 (마우스 오버: 페블 + 예측 비율)
          </p>
        </div>
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
                const p = payload[0].payload as any;
                return (
                  <div className="bg-popover border border-border rounded-lg p-3 shadow-xl">
                    <div className="text-sm font-semibold text-foreground">{p.label}</div>
                    <div className="mt-1 text-sm font-semibold transition-colors duration-200" style={{ color: p.fillColor }}>
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
                  stroke={entry.strokeColor}
                  strokeWidth={1}
                  className="transition-colors duration-200"
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* 옵션별 비율 게이지 — 색상 직관 매칭 */}
      <div className="space-y-3 pt-1">
        {data.map((row) => (
          <div key={row.id} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="font-medium text-foreground truncate">{row.label}</span>
              <span className="tabular-nums font-semibold shrink-0 transition-colors duration-200" style={{ color: row.fillColor }}>
                {row.percentage}%
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-secondary/80 overflow-hidden border border-border/40">
              <div
                className="h-full rounded-full transition-all duration-300 ease-out"
                style={{
                  width: `${Math.min(100, Math.max(0, row.percentage))}%`,
                  backgroundColor: row.fillColor,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

