"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Trophy } from "lucide-react";
import { loadBoardPosts, type BoardPost } from "@/lib/board";
import { loadComments, type Comment } from "@/lib/comments";
import { loadUserMarkets, type UserMarket } from "@/lib/markets";
import { createClient } from "@/utils/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function NotificationsBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [userName, setUserName] = useState("");
  const [userId, setUserId] = useState("");
  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [userMarkets, setUserMarkets] = useState<UserMarket[]>([]);

  useEffect(() => {
    const supabase = createClient();

    const loadAll = () => {
      setPosts(loadBoardPosts());
      setComments(loadComments());
      setUserMarkets(loadUserMarkets());
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user;
      if (!u) return;
      const name =
        u.user_metadata?.nickname ??
        u.user_metadata?.full_name ??
        u.user_metadata?.name ??
        u.email?.split("@")[0] ?? "";
      setUserName(name);
      setUserId(u.id);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user;
      if (!u) { setUserName(""); setUserId(""); return; }
      const name =
        u.user_metadata?.nickname ??
        u.user_metadata?.full_name ??
        u.user_metadata?.name ??
        u.email?.split("@")[0] ?? "";
      setUserName(name);
      setUserId(u.id);
    });

    loadAll();

    const onCommentsUpdated = () => setComments(loadComments());
    const onPostsUpdated = () => setPosts(loadBoardPosts());
    const onMarketsUpdated = () => setUserMarkets(loadUserMarkets());

    window.addEventListener("voters:commentsUpdated", onCommentsUpdated as EventListener);
    window.addEventListener("voters:postsUpdated", onPostsUpdated as EventListener);
    window.addEventListener("voters:marketsUpdated", onMarketsUpdated as EventListener);
    window.addEventListener("storage", loadAll);
    return () => {
      authListener.subscription.unsubscribe();
      window.removeEventListener("voters:commentsUpdated", onCommentsUpdated as EventListener);
      window.removeEventListener("voters:postsUpdated", onPostsUpdated as EventListener);
      window.removeEventListener("voters:marketsUpdated", onMarketsUpdated as EventListener);
      window.removeEventListener("storage", loadAll);
    };
  }, []);

  // ─── 결과 입력 대기 보트 (창작자 전용) ─────────────────────────────────────
  const pendingSettlements = useMemo(() => {
    if (!userId) return [] as UserMarket[];
    const now = new Date();
    return userMarkets.filter(
      (m) =>
        m.authorId === userId &&
        !m.winningOptionId &&
        m.resultAt &&
        new Date(m.resultAt) <= now,
    );
  }, [userMarkets, userId]);

  // ─── 댓글 알림 ────────────────────────────────────────────────────────────
  const myPostIds = useMemo(() => {
    if (!userName) return new Set<string>();
    return new Set(posts.filter((p) => p.author === userName).map((p) => p.id));
  }, [posts, userName]);

  const postTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of posts) map.set(p.id, p.title);
    return map;
  }, [posts]);

  const lastSeenKey = useMemo(() => `voters.notifications.lastSeen.${userId || "anon"}`, [userId]);

  const [lastSeenMs, setLastSeenMs] = useState(0);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem(lastSeenKey);
    const n = raw ? Number(raw) : 0;
    setLastSeenMs(Number.isFinite(n) ? n : 0);
  }, [lastSeenKey, open]);

  const commentNotifications = useMemo(() => {
    if (!userName) return [];
    return comments
      .filter((c) => myPostIds.has(c.postId) && c.author !== userName)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 20);
  }, [comments, myPostIds, userName]);

  const hasUnreadComments = useMemo(
    () => commentNotifications.some((n) => new Date(n.createdAt).getTime() > lastSeenMs),
    [commentNotifications, lastSeenMs],
  );

  const hasPendingSettlement = pendingSettlements.length > 0;

  // ─── 로그인 안 된 경우 ─────────────────────────────────────────────────────
  if (!userName) {
    return (
      <button className="relative p-2 rounded-lg hover:bg-secondary transition-colors hidden sm:flex">
        <Bell className="size-5 text-muted-foreground" />
      </button>
    );
  }

  const totalCount = commentNotifications.length + pendingSettlements.length;

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) {
          window.localStorage.setItem(lastSeenKey, String(Date.now()));
          setLastSeenMs(Date.now());
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        <button className="relative p-2 rounded-lg hover:bg-secondary transition-colors hidden sm:flex">
          <Bell className="size-5 text-muted-foreground" />
          {/* 결과 입력 대기 → 보라색 점 (우선) */}
          {hasPendingSettlement && (
            <span className="absolute top-1 right-1 size-2.5 rounded-full bg-chart-5 ring-2 ring-background animate-pulse" />
          )}
          {/* 댓글 알림만 있을 때 → 파란색 점 */}
          {!hasPendingSettlement && hasUnreadComments && (
            <span className="absolute top-1 right-1 size-2 rounded-full bg-neon-blue" />
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[360px]">
        <DropdownMenuLabel className="flex items-center justify-between">
          <span>알림</span>
          {totalCount > 0 && (
            <span className="text-xs text-muted-foreground font-normal">{totalCount}개</span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* ─── 결과 입력 대기 보트 (보라색 강조) ─────────────────────────── */}
        {pendingSettlements.length > 0 && (
          <>
            <div className="px-2 py-1">
              <p className="text-[11px] font-semibold text-chart-5 uppercase tracking-wide flex items-center gap-1">
                <Trophy className="size-3" />
                결과 입력 필요
              </p>
            </div>
            {pendingSettlements.map((m) => (
              <DropdownMenuItem
                key={m.id}
                onSelect={(e) => {
                  e.preventDefault();
                  setOpen(false);
                  router.push(`/market/${m.id}`);
                }}
                className="flex flex-col items-start gap-1 border-l-2 border-chart-5/50 pl-3 ml-1 my-0.5"
              >
                <div className="flex items-center gap-1.5 w-full">
                  <span
                    className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                    style={{ background: "color-mix(in oklch, var(--chart-5) 15%, transparent)", color: "var(--chart-5)" }}
                  >
                    결과 입력
                  </span>
                  <span className="text-xs text-muted-foreground truncate">
                    {m.resultAt
                      ? new Date(m.resultAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })
                      : ""}
                  </span>
                </div>
                <div className="w-full text-sm font-medium text-foreground line-clamp-2 leading-snug">
                  {m.question}
                </div>
              </DropdownMenuItem>
            ))}
            {commentNotifications.length > 0 && <DropdownMenuSeparator />}
          </>
        )}

        {/* ─── 댓글 알림 ──────────────────────────────────────────────────── */}
        {commentNotifications.length > 0 && (
          <>
            <div className="px-2 py-1">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
                댓글 알림
              </p>
            </div>
            {commentNotifications.slice(0, 8).map((n) => (
              <DropdownMenuItem
                key={n.id}
                onSelect={(e) => {
                  e.preventDefault();
                  setOpen(false);
                  router.push(`/board/${n.postId}`);
                }}
                className="flex flex-col items-start gap-1"
              >
                <div className="flex items-center gap-2 w-full">
                  {new Date(n.createdAt).getTime() > lastSeenMs && (
                    <span className="size-1.5 rounded-full bg-neon-blue shrink-0" />
                  )}
                  <div className="text-sm font-medium text-foreground line-clamp-1 flex-1">
                    {postTitleById.get(n.postId) ?? "게시글"}
                  </div>
                </div>
                <div className="w-full text-xs text-muted-foreground line-clamp-2">
                  {n.author}: {n.content}
                </div>
                <div className="text-[11px] text-muted-foreground/70">
                  {new Date(n.createdAt).toLocaleString("ko-KR")}
                </div>
              </DropdownMenuItem>
            ))}
          </>
        )}

        {totalCount === 0 && (
          <div className="px-2 py-8 text-center text-sm text-muted-foreground">
            알림이 없습니다.
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

