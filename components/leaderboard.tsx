"use client";

import { useEffect, useState, useRef } from "react";
import { Trophy, ArrowUp, ArrowDown, Minus } from "lucide-react";
import { useRouter } from "next/navigation";
import { LevelIcon } from "@/components/level-icon";
import type { RankingEntry } from "@/app/api/ranking/route";
import { cn } from "@/lib/utils";

const RANK_MEDALS = ["🥇", "🥈", "🥉"];
const SLIDE_INTERVAL = 20_000; // 20초마다 다음 사람
const FETCH_INTERVAL = 60_000; // 60초마다 데이터 갱신

function RankChangeChip({ change }: { change: number | null }) {
  if (change === null) return null;
  if (change === 0) return <Minus className="size-3 text-muted-foreground/60" />;
  if (change > 0)
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-500">
        <ArrowUp className="size-2.5" />{change}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-red-500">
      <ArrowDown className="size-2.5" />{Math.abs(change)}
    </span>
  );
}

export function UserLeaderboard({ className }: { className?: string }) {
  const router = useRouter();
  const [entries, setEntries] = useState<RankingEntry[]>([]);
  const [cursor, setCursor] = useState(0); // 현재 보여주는 인덱스 (0~9)
  const [visible, setVisible] = useState(true); // fade 제어
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // TOP 10 데이터 가져오기
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/ranking?page=1&limit=10", { cache: "no-store" });
        const json = (await res.json()) as { ok: boolean; rankings?: RankingEntry[] };
        if (!cancelled && json.ok) setEntries(json.rankings ?? []);
      } catch { /* 무시 */ }
    };
    void load();
    const id = setInterval(() => void load(), FETCH_INTERVAL);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // 20초마다 다음 순위로 슬라이드
  useEffect(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (entries.length === 0) return;

    timerRef.current = setInterval(() => {
      setVisible(false);
      setTimeout(() => {
        setCursor((c) => (c + 1) % Math.min(entries.length, 10));
        setVisible(true);
      }, 300);
    }, SLIDE_INTERVAL);

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [entries.length]);

  const entry = entries[cursor] ?? null;
  const total = Math.min(entries.length, 10);

  return (
    <div
      className={cn(
        "rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm overflow-hidden cursor-pointer group",
        className,
      )}
      onClick={() => router.push("/ranking")}
      title="전체 순위 보기"
    >
      {/* 헤더 */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/40 bg-secondary/20 group-hover:bg-secondary/30 transition-colors">
        <Trophy className="size-3 text-yellow-400 shrink-0" />
        <span className="text-xs font-semibold text-foreground">유저 순위</span>
        {/* 점 인디케이터 */}
      </div>

      {/* 현재 순위 한 명 */}
      <div
        className={cn(
          "flex items-center gap-2.5 px-3 py-2 transition-opacity duration-300",
          visible ? "opacity-100" : "opacity-0",
        )}
      >
        {entry ? (
          <>
            {/* 메달 / 순위 번호 */}
            <span className="w-6 text-center shrink-0">
              {entry.rank <= 3 ? (
                <span className="text-base leading-none">{RANK_MEDALS[entry.rank - 1]}</span>
              ) : (
                <span className="text-xs font-black text-muted-foreground tabular-nums">
                  {entry.rank}
                </span>
              )}
            </span>

            {/* 레벨 아이콘 */}
            <LevelIcon level={entry.level} size={16} className="shrink-0" />

            {/* 닉네임 */}
            <span className="flex-1 text-xs font-semibold text-foreground truncate min-w-0">
              {entry.nickname}
            </span>

            {/* 순위 변동 */}
            <RankChangeChip change={entry.rankChange} />

            {/* 총 포인트 */}
            <span className="text-xs text-muted-foreground tabular-nums shrink-0">
              {entry.totalPoints.toLocaleString()}&thinsp;P
            </span>
          </>
        ) : (
          <span className="text-xs text-muted-foreground py-0.5">불러오는 중…</span>
        )}
      </div>

      {/* 하단 힌트 */}
      <div className="px-3 pb-1.5 text-center">
        <span className="text-xs text-muted-foreground/50 group-hover:text-muted-foreground/80 transition-colors">
          전체 순위 보기 →
        </span>
      </div>
    </div>
  );
}
