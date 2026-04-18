"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { LayoutList, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

type ActivityData = {
  posts: { id: string; title: string; category: string; createdAt: string }[];
  boardComments: { id: string; postId: string; postTitle: string; content: string; createdAt: string }[];
  boatComments: { id: string; betId: string; betTitle: string; content: string; createdAt: string }[];
  bets: { id: string; title: string; category: string; status: string; createdAt: string }[];
};

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
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ActivityData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !knownUserId) {
      setData(null);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    void fetch(`/api/admin/users/${encodeURIComponent(knownUserId)}/activity`, {
      credentials: "same-origin",
    })
      .then((r) => r.json())
      .then((j: { ok?: boolean; error?: string } & Partial<ActivityData>) => {
        if (j.ok) {
          setData({
            posts: j.posts ?? [],
            boardComments: j.boardComments ?? [],
            boatComments: j.boatComments ?? [],
            bets: j.bets ?? [],
          });
        } else {
          setError(j.error ?? "데이터를 불러오지 못했습니다.");
        }
      })
      .catch(() => setError("네트워크 오류가 발생했습니다."))
      .finally(() => setLoading(false));
  }, [open, knownUserId]);

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
            DB에 저장된 실제 활동 데이터입니다.
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[min(70vh,560px)] px-6 pb-6">
          {loading && (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}

          {!loading && error && (
            <p className="py-10 text-center text-sm text-destructive">{error}</p>
          )}

          {!loading && data && (
            <div className="space-y-6 pr-3">
              {/* 생성한 보트 */}
              <section>
                <h3 className="text-sm font-bold text-foreground mb-2">
                  생성 보트 <span className="text-muted-foreground font-normal">({data.bets.length})</span>
                </h3>
                {data.bets.length === 0 ? (
                  <p className="text-xs text-muted-foreground">없음</p>
                ) : (
                  <ul className="space-y-2">
                    {data.bets.map((m) => (
                      <li key={m.id}>
                        <Link
                          href={`/market/${m.id}`}
                          className="block rounded-lg border border-border/50 bg-secondary/20 px-3 py-2 text-left hover:bg-secondary/40 transition-colors"
                        >
                          <span className="text-sm font-medium text-foreground line-clamp-2">{m.title}</span>
                          <span className="mt-1 block text-[11px] text-muted-foreground tabular-nums">
                            {new Date(m.createdAt).toLocaleString("ko-KR")}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* 게시글 */}
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

              {/* 게시판 댓글 */}
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

              {/* 보트 댓글 */}
              <section>
                <h3 className="text-sm font-bold text-foreground mb-2">
                  댓글 (보트) <span className="text-muted-foreground font-normal">({data.boatComments.length})</span>
                </h3>
                {data.boatComments.length === 0 ? (
                  <p className="text-xs text-muted-foreground">없음</p>
                ) : (
                  <ul className="space-y-2">
                    {data.boatComments.map((c) => (
                      <li key={c.id}>
                        <Link
                          href={`/market/${c.betId}`}
                          className="block rounded-lg border border-border/50 bg-secondary/20 px-3 py-2 text-left hover:bg-secondary/40 transition-colors"
                        >
                          {c.betTitle && (
                            <span className="text-[11px] text-chart-5 font-medium line-clamp-1">↳ {c.betTitle}</span>
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
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
