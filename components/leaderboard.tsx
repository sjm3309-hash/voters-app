"use client";

import { useEffect, useState } from "react";
import { Trophy } from "lucide-react";
import { getLeaderboard, type LeaderboardEntry } from "@/lib/leaderboard";
import { LevelIcon } from "@/components/level-icon";
import { cn } from "@/lib/utils";

const RANK_MEDALS = ["🥇", "🥈", "🥉"];

function RankItem({ entry, rank }: { entry: LeaderboardEntry; rank: number }) {
  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-secondary/40 transition-colors group">
      {/* 순위 */}
      <span className="w-6 text-center text-xs font-bold shrink-0">
        {rank <= 3 ? (
          <span className="text-sm">{RANK_MEDALS[rank - 1]}</span>
        ) : (
          <span className="text-muted-foreground">{rank}</span>
        )}
      </span>

      {/* 레벨 아이콘 */}
      <LevelIcon level={entry.level} size={14} className="shrink-0" />

      {/* 닉네임 */}
      <span className="flex-1 text-xs font-medium text-foreground truncate min-w-0">
        {entry.displayName}
      </span>

      {/* 총 페블 */}
      <span className="text-xs text-muted-foreground tabular-nums shrink-0">
        {entry.totalWealth.toLocaleString()}&thinsp;P
      </span>
    </div>
  );
}

export function UserLeaderboard({ className }: { className?: string }) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [page, setPage] = useState<0 | 1>(0); // 0 = 1~5위, 1 = 6~10위
  const [fade, setFade] = useState(true);

  const load = () => setEntries(getLeaderboard());

  useEffect(() => {
    load();

    // 페블 또는 레벨 변경 시 즉시 갱신
    const refresh = () => load();
    window.addEventListener("voters:pointsUpdated", refresh);
    window.addEventListener("voters:levelUpdated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("voters:pointsUpdated", refresh);
      window.removeEventListener("voters:levelUpdated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  // 5초마다 1~5위 ↔ 6~10위 토글 (10위 이상 데이터가 있을 때만)
  useEffect(() => {
    if (entries.length <= 5) return;
    const id = setInterval(() => {
      setFade(false);
      setTimeout(() => {
        setPage((p) => (p === 0 ? 1 : 0));
        setFade(true);
      }, 250);
    }, 5000);
    return () => clearInterval(id);
  }, [entries.length]);

  const slice = page === 0 ? entries.slice(0, 5) : entries.slice(5, 10);
  const rankOffset = page === 0 ? 1 : 6;

  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm overflow-hidden",
        className,
      )}
    >
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40 bg-secondary/20">
        <Trophy className="size-3.5 text-yellow-400" />
        <span className="text-xs font-semibold text-foreground">유저 순위</span>
        <span className="ml-auto text-[10px] text-muted-foreground tabular-nums">
          {page === 0 ? "1 – 5위" : "6 – 10위"}
        </span>
        {entries.length > 5 && (
          <div className="flex gap-1 ml-1">
            <button
              onClick={() => setPage(0)}
              className={cn(
                "size-1.5 rounded-full transition-colors",
                page === 0 ? "bg-chart-5" : "bg-muted-foreground/30",
              )}
            />
            <button
              onClick={() => setPage(1)}
              className={cn(
                "size-1.5 rounded-full transition-colors",
                page === 1 ? "bg-chart-5" : "bg-muted-foreground/30",
              )}
            />
          </div>
        )}
      </div>

      {/* 리스트 */}
      <div
        className={cn(
          "px-1 py-1 transition-opacity duration-200",
          fade ? "opacity-100" : "opacity-0",
        )}
      >
        {slice.length === 0 ? (
          <p className="text-center text-xs text-muted-foreground py-4">
            아직 데이터가 없습니다
          </p>
        ) : (
          slice.map((entry, i) => (
            <RankItem key={entry.displayName} entry={entry} rank={rankOffset + i} />
          ))
        )}
      </div>
    </div>
  );
}
