"use client";

import { useEffect, useState, useCallback } from "react";
import { Trophy, ArrowUp, ArrowDown, Minus, ChevronLeft, ChevronRight, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { createClient } from "@/utils/supabase/client";
import { LevelIcon } from "@/components/level-icon";
import type { RankingEntry } from "@/app/api/ranking/route";
import { cn } from "@/lib/utils";

const MEDALS = ["🥇", "🥈", "🥉"];
const PAGE_SIZE = 100;

function RankChangeChip({ change }: { change: number | null }) {
  if (change === null) return <span className="text-xs text-muted-foreground">NEW</span>;
  if (change === 0) return <Minus className="size-3 text-muted-foreground" />;
  if (change > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-500">
        <ArrowUp className="size-3" />
        {change}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-red-500">
      <ArrowDown className="size-3" />
      {Math.abs(change)}
    </span>
  );
}

function RankRow({ entry }: { entry: RankingEntry }) {
  const medal = entry.rank <= 3 ? MEDALS[entry.rank - 1] : null;
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-colors hover:bg-secondary/40",
        entry.rank <= 3 && "bg-yellow-500/5",
      )}
    >
      {/* 순위 */}
      <div className="w-8 shrink-0 text-center">
        {medal ? (
          <span className="text-base">{medal}</span>
        ) : (
          <span className="text-xs font-bold text-muted-foreground tabular-nums">{entry.rank}</span>
        )}
      </div>

      {/* 레벨 아이콘 */}
      <LevelIcon level={entry.level} size={16} className="shrink-0" />

      {/* 닉네임 */}
      <span className="flex-1 text-sm font-medium truncate min-w-0">{entry.nickname}</span>

      {/* 순위 변동 */}
      <div className="w-10 flex justify-center shrink-0">
        <RankChangeChip change={entry.rankChange} />
      </div>

      {/* 총 포인트 */}
      <span className="text-xs text-muted-foreground tabular-nums shrink-0 text-right w-24">
        {entry.totalPoints.toLocaleString()} P
      </span>
    </div>
  );
}

function MyRankPanel({ myRank }: { myRank: RankingEntry | null }) {
  if (!myRank) {
    return (
      <div className="rounded-xl border border-border/60 bg-card/80 p-4 text-center text-sm text-muted-foreground">
        로그인하면 내 순위를 확인할 수 있습니다
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm overflow-hidden sticky top-4">
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border/40 bg-secondary/20">
        <Trophy className="size-3.5 text-yellow-400" />
        <span className="text-xs font-semibold">내 순위</span>
      </div>
      <div className="p-4 flex flex-col gap-3">
        {/* 현재 순위 */}
        <div className="text-center">
          <p className="text-4xl font-black tabular-nums">
            {myRank.rank <= 3 ? MEDALS[myRank.rank - 1] : `${myRank.rank}위`}
          </p>
          {myRank.rank > 3 && (
            <p className="text-xs text-muted-foreground mt-0.5">현재 순위</p>
          )}
        </div>

        {/* 순위 변동 */}
        <div className="flex items-center justify-center gap-1.5">
          {myRank.rankChange === null ? (
            <span className="text-sm text-muted-foreground">처음 집계된 순위입니다</span>
          ) : myRank.rankChange === 0 ? (
            <span className="text-sm text-muted-foreground">어제와 동일</span>
          ) : myRank.rankChange > 0 ? (
            <span className="inline-flex items-center gap-1 text-emerald-500 font-semibold text-sm">
              <ArrowUp className="size-4" />
              어제보다 {myRank.rankChange}위 상승
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-red-500 font-semibold text-sm">
              <ArrowDown className="size-4" />
              어제보다 {Math.abs(myRank.rankChange)}위 하락
            </span>
          )}
        </div>

        {/* 레벨 + 닉네임 */}
        <div className="flex items-center justify-center gap-2 pt-1 border-t border-border/40">
          <LevelIcon level={myRank.level} size={16} />
          <span className="text-sm font-medium">{myRank.nickname}</span>
        </div>

        {/* 총 포인트 */}
        <div className="text-center">
          <p className="text-xs text-muted-foreground">총 포인트</p>
          <p className="text-lg font-bold tabular-nums">{myRank.totalPoints.toLocaleString()} P</p>
        </div>
      </div>
    </div>
  );
}

export function RankingClient() {
  const [rankings, setRankings] = useState<RankingEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [myRank, setMyRank] = useState<RankingEntry | null>(null);

  // 현재 로그인 유저 ID 획득
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setMyUserId(data.user?.id ?? null);
    });
  }, []);

  const fetchRankings = useCallback(async (p: number, uid: string | null) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(p),
        limit: String(PAGE_SIZE),
      });
      if (uid) params.set("myUserId", uid);

      const res = await fetch(`/api/ranking?${params.toString()}`, { cache: "no-store" });
      const json = (await res.json()) as {
        ok: boolean;
        rankings?: RankingEntry[];
        total?: number;
        myRank?: RankingEntry | null;
      };

      if (json.ok) {
        setRankings(json.rankings ?? []);
        setTotal(json.total ?? 0);
        setMyRank(json.myRank ?? null);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchRankings(page, myUserId);
  }, [fetchRankings, page, myUserId]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-5xl mx-auto px-4 py-6 sm:py-8">
        {/* 헤더 */}
        <div className="flex items-center gap-3 mb-6">
          <Link
            href="/"
            className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground shrink-0"
            aria-label="홈으로"
          >
            <ArrowLeft className="size-5" />
          </Link>
          <Trophy className="size-6 text-yellow-400 shrink-0" />
          <div>
            <h1 className="text-xl font-bold">유저 순위</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              총 포인트 기준 실시간 집계 (레벨업 누적 + 보유 페블)
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_220px] gap-4">
          {/* 순위 목록 */}
          <div className="rounded-xl border border-border/60 bg-card/80 overflow-hidden">
            {/* 테이블 헤더 */}
            <div className="flex items-center gap-2.5 px-3 py-2 border-b border-border/40 bg-secondary/20 text-xs text-muted-foreground font-medium">
              <div className="w-8 text-center shrink-0">순위</div>
              <div className="w-4 shrink-0" />
              <div className="flex-1">닉네임</div>
              <div className="w-10 text-center shrink-0">변동</div>
              <div className="w-24 text-right shrink-0">총 포인트</div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16 text-muted-foreground text-sm">
                불러오는 중...
              </div>
            ) : rankings.length === 0 ? (
              <div className="text-center py-16 text-muted-foreground text-sm">
                아직 데이터가 없습니다
              </div>
            ) : (
              <div className="px-1 py-1 divide-y divide-border/20">
                {rankings.map((entry) => (
                  <RankRow key={entry.userId} entry={entry} />
                ))}
              </div>
            )}

            {/* 페이지네이션 */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-border/40">
                <span className="text-xs text-muted-foreground tabular-nums">
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)}위 / 총 {total}명
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md hover:bg-secondary/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronLeft className="size-4" />
                  </button>
                  <span className="text-xs font-medium tabular-nums px-2">
                    {page} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-md hover:bg-secondary/60 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 내 순위 패널 */}
          <div>
            <MyRankPanel myRank={myRank} />
          </div>
        </div>
      </div>
    </div>
  );
}
