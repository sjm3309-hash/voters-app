"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { LayoutList } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  getUserBoardCommentsForAdmin,
  getUserBoardPostsForAdmin,
  getUserMarketCommentsForAdmin,
  getUserMarketsForAdmin,
} from "@/lib/admin-user-activity";

export function UserActivityDialog({
  displayName,
  knownUserId,
  open,
  onOpenChange,
}: {
  displayName: string;
  knownUserId: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!open) return;
    const bump = () => setTick((n) => n + 1);
    bump();
    window.addEventListener("voters:postsUpdated", bump as EventListener);
    window.addEventListener("voters:commentsUpdated", bump as EventListener);
    window.addEventListener("voters:marketsUpdated", bump as EventListener);
    window.addEventListener("voters:marketCommentsUpdated", bump as EventListener);
    window.addEventListener("storage", bump as EventListener);
    return () => {
      window.removeEventListener("voters:postsUpdated", bump as EventListener);
      window.removeEventListener("voters:commentsUpdated", bump as EventListener);
      window.removeEventListener("voters:marketsUpdated", bump as EventListener);
      window.removeEventListener("voters:marketCommentsUpdated", bump as EventListener);
      window.removeEventListener("storage", bump as EventListener);
    };
  }, [open]);

  const data = useMemo(
    () => ({
      markets: getUserMarketsForAdmin(displayName, knownUserId),
      posts: getUserBoardPostsForAdmin(displayName),
      boardComments: getUserBoardCommentsForAdmin(displayName),
      marketComments: getUserMarketCommentsForAdmin(displayName),
    }),
    [displayName, knownUserId, tick],
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="sm:max-w-2xl max-h-[90vh] flex flex-col gap-0 overflow-hidden p-0"
      >
        <DialogHeader className="px-6 pt-6 pb-2 shrink-0 text-left">
          <DialogTitle className="flex items-center gap-2">
            <LayoutList className="size-5 text-chart-5" />
            {displayName}님의 활동
          </DialogTitle>
          <DialogDescription>
            이 기기·브라우저에 저장된 데이터만 표시됩니다. 닉네임 변경 전 글은 이전 이름으로만 집계될 수 있습니다.
          </DialogDescription>
        </DialogHeader>
        <ScrollArea className="max-h-[min(70vh,560px)] px-6 pb-6">
          <div className="space-y-6 pr-3">
            <section>
              <h3 className="text-sm font-bold text-foreground mb-2">
                작성 보트 <span className="text-muted-foreground font-normal">({data.markets.length})</span>
              </h3>
              {data.markets.length === 0 ? (
                <p className="text-xs text-muted-foreground">없음</p>
              ) : (
                <ul className="space-y-2">
                  {data.markets.map((m) => (
                    <li key={m.id}>
                      <Link
                        href={`/market/${m.id}`}
                        className="block rounded-lg border border-border/50 bg-secondary/20 px-3 py-2 text-left hover:bg-secondary/40 transition-colors"
                      >
                        <span className="text-sm font-medium text-foreground line-clamp-2">{m.question}</span>
                        <span className="mt-1 block text-[11px] text-muted-foreground tabular-nums">
                          {new Date(m.createdAt).toLocaleString("ko-KR")}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="text-sm font-bold text-foreground mb-2">
                작성 게시글 <span className="text-muted-foreground font-normal">({data.posts.length})</span>
              </h3>
              {data.posts.length === 0 ? (
                <p className="text-xs text-muted-foreground">없음</p>
              ) : (
                <ul className="space-y-2">
                  {data.posts.map((p) => (
                    <li key={p.id}>
                      <Link
                        href={`/board/${p.id}`}
                        className="block rounded-lg border border-border/50 bg-secondary/20 px-3 py-2 text-left hover:bg-secondary/40 transition-colors"
                      >
                        <span className="text-sm font-medium text-foreground line-clamp-2">{p.title}</span>
                        <span className="mt-1 block text-[11px] text-muted-foreground tabular-nums">
                          {new Date(p.createdAt).toLocaleString("ko-KR")}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="text-sm font-bold text-foreground mb-2">
                댓글 (게시판) <span className="text-muted-foreground font-normal">({data.boardComments.length})</span>
              </h3>
              {data.boardComments.length === 0 ? (
                <p className="text-xs text-muted-foreground">없음</p>
              ) : (
                <ul className="space-y-2">
                  {data.boardComments.map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`/board/${c.postId}`}
                        className="block rounded-lg border border-border/50 bg-secondary/20 px-3 py-2 text-left hover:bg-secondary/40 transition-colors"
                      >
                        {c.postTitle && (
                          <span className="text-[11px] text-chart-5 font-medium line-clamp-1">↳ {c.postTitle}</span>
                        )}
                        <p className="text-sm text-foreground line-clamp-2 mt-0.5">{c.content}</p>
                        <span className="mt-1 block text-[11px] text-muted-foreground tabular-nums">
                          {new Date(c.createdAt).toLocaleString("ko-KR")}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section>
              <h3 className="text-sm font-bold text-foreground mb-2">
                댓글 (보트) <span className="text-muted-foreground font-normal">({data.marketComments.length})</span>
              </h3>
              {data.marketComments.length === 0 ? (
                <p className="text-xs text-muted-foreground">없음</p>
              ) : (
                <ul className="space-y-2">
                  {data.marketComments.map((c) => (
                    <li key={c.id}>
                      <Link
                        href={`/market/${c.marketId}`}
                        className="block rounded-lg border border-border/50 bg-secondary/20 px-3 py-2 text-left hover:bg-secondary/40 transition-colors"
                      >
                        {c.marketQuestion && (
                          <span className="text-[11px] text-chart-5 font-medium line-clamp-1">↳ {c.marketQuestion}</span>
                        )}
                        <p className="text-sm text-foreground line-clamp-2 mt-0.5">{c.content}</p>
                        <span className="mt-1 block text-[11px] text-muted-foreground tabular-nums">
                          {new Date(c.createdAt).toLocaleString("ko-KR")}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
