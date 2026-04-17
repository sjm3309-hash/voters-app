"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { getLikeCount } from "@/lib/likes";
import { loadBoardPosts, postTrendingScore, type BoardPost } from "@/lib/board";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { cn } from "@/lib/utils";

function rankPosts(posts: BoardPost[]): BoardPost[] {
  return [...posts]
    .map((p) => ({
      post: p,
      score: postTrendingScore(p, getLikeCount({ type: "post", id: p.id })),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((x) => x.post);
}

export function TrendingPostsSidebar({ className }: { className?: string }) {
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    window.addEventListener("voters:postsUpdated", bump as EventListener);
    window.addEventListener("storage", bump as EventListener);
    return () => {
      window.removeEventListener("voters:postsUpdated", bump as EventListener);
      window.removeEventListener("storage", bump as EventListener);
    };
  }, []);

  const topPosts = useMemo(() => rankPosts(loadBoardPosts()), [tick]);

  return (
    <Card
      className={cn(
        "border-border/60 bg-card/80 shadow-sm backdrop-blur-sm transition-shadow duration-300",
        className,
      )}
    >
      <CardHeader className="pb-2 space-y-1">
        <CardTitle className="text-base font-bold leading-snug flex items-center gap-2">
          <span aria-hidden className="select-none">
            🔥
          </span>
          지금 핫한 토론
        </CardTitle>
        <CardDescription className="text-xs flex items-center gap-1.5">
          <span aria-hidden>💬</span> 실시간 인기글
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 pt-0">
        {topPosts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            아직 게시글이 없습니다
          </p>
        ) : (
          <ul className="space-y-2">
            {topPosts.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/board/${p.id}`}
                  className="block rounded-xl border border-border/50 bg-secondary/25 px-3 py-2.5 text-left transition-all duration-200 hover:border-chart-5/35 hover:bg-secondary/45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-chart-5/40"
                >
                  <p className="text-sm font-semibold text-foreground line-clamp-2 leading-snug">
                    {p.title}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span className="truncate font-medium text-foreground/85">
                      {p.author}
                    </span>
                    <span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
                      <MessageCircle className="size-3.5 text-chart-5/90" aria-hidden />
                      {p.commentCount ?? 0}
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

