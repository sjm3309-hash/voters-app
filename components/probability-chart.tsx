"use client";

import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { cn } from "@/lib/utils";

interface PriceDataPoint {
  timestamp: Date;
  yesPrice: number;
  volume: number;
}

interface ProbabilityChartProps {
  data: PriceDataPoint[];
  className?: string;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{
    value: number;
    payload: {
      timestamp: Date;
      yesPrice: number;
      volume: number;
    };
  }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <div className="bg-popover border border-border rounded-lg p-3 shadow-xl">
        <p className="text-xs text-muted-foreground mb-1">
          {formatDate(data.timestamp)} {formatTime(data.timestamp)}
        </p>
        <div className="flex items-center gap-2">
          <span className="text-neon-green font-semibold text-lg">
            {data.yesPrice.toFixed(1)}%
          </span>
          <span className="text-muted-foreground text-sm">YES</span>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-neon-red font-semibold text-lg">
            {(100 - data.yesPrice).toFixed(1)}%
          </span>
          <span className="text-muted-foreground text-sm">NO</span>
        </div>
        <p className="text-xs text-muted-foreground mt-2 pt-2 border-t border-border">
          Vol: {data.volume.toLocaleString()} P
        </p>
      </div>
    );
  }
  return null;
}

export function ProbabilityChart({ data, className }: ProbabilityChartProps) {
  const chartData = useMemo(() => {
    return data.map((d) => ({
      ...d,
      time: formatDate(d.timestamp),
      fullTime: `${formatDate(d.timestamp)} ${formatTime(d.timestamp)}`,
    }));
  }, [data]);

  const minPrice = useMemo(() => {
    const min = Math.min(...data.map((d) => d.yesPrice));
    return Math.max(0, min - 10);
  }, [data]);

  const maxPrice = useMemo(() => {
    const max = Math.max(...data.map((d) => d.yesPrice));
    return Math.min(100, max + 10);
  }, [data]);

  return (
    <div className={cn("w-full", className)}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="size-3 rounded-full bg-neon-green" />
            <span className="text-sm text-muted-foreground">YES Probability</span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button className="px-2 py-1 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors">
            1D
          </button>
          <button className="px-2 py-1 rounded bg-neon-blue/20 text-neon-blue border border-neon-blue/30">
            1W
          </button>
          <button className="px-2 py-1 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors">
            1M
          </button>
          <button className="px-2 py-1 rounded bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors">
            ALL
          </button>
        </div>
      </div>
      <div className="h-[300px] md:h-[350px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="yesGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="5%"
                  stopColor="oklch(0.7 0.18 150)"
                  stopOpacity={0.4}
                />
                <stop
                  offset="95%"
                  stopColor="oklch(0.7 0.18 150)"
                  stopOpacity={0}
                />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="oklch(0.3 0.02 260)"
              vertical={false}
            />
            <XAxis
              dataKey="time"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "oklch(0.6 0 0)", fontSize: 12 }}
              dy={10}
            />
            <YAxis
              domain={[minPrice, maxPrice]}
              axisLine={false}
              tickLine={false}
              tick={{ fill: "oklch(0.6 0 0)", fontSize: 12 }}
              tickFormatter={(value) => `${value}%`}
              dx={-10}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="yesPrice"
              stroke="oklch(0.7 0.18 150)"
              strokeWidth={2}
              fill="url(#yesGradient)"
              dot={false}
              activeDot={{
                r: 6,
                fill: "oklch(0.7 0.18 150)",
                stroke: "oklch(0.12 0.01 260)",
                strokeWidth: 2,
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
