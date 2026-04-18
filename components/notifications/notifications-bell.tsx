"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, CheckCheck, MessageSquare, Trophy, Trash2 } from "lucide-react";
import { loadUserMarkets, type UserMarket } from "@/lib/markets";
import { createClient } from "@/utils/supabase/client";
import type { DbNotification } from "@/app/api/notifications/route";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function NotificationsBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState("");
  const [notifications, setNotifications] = useState<DbNotification[]>([]);
  const [userMarkets, setUserMarkets] = useState<UserMarket[]>([]);
  const [loadingNotif, setLoadingNotif] = useState(false);

  // ─── 현재 유저 ──────────────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user;
      if (u) setUserId(u.id);
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user?.id ?? "");
    });
    return () => authListener.subscription.unsubscribe();
  }, []);

  // ─── 결과 입력 대기 보트 (창작자 전용) ─────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    setUserMarkets(loadUserMarkets());
    const onMarketsUpdated = () => setUserMarkets(loadUserMarkets());
    window.addEventListener("voters:marketsUpdated", onMarketsUpdated as EventListener);
    window.addEventListener("storage", onMarketsUpdated as EventListener);
    return () => {
      window.removeEventListener("voters:marketsUpdated", onMarketsUpdated as EventListener);
      window.removeEventListener("storage", onMarketsUpdated as EventListener);
    };
  }, [userId]);

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

  // ─── DB 알림 로드 ────────────────────────────────────────────────────────
  const fetchNotifications = useCallback(async () => {
    if (!userId) return;
    setLoadingNotif(true);
    try {
      const res = await fetch("/api/notifications", { credentials: "same-origin" });
      if (!res.ok) return;
      const json = await res.json();
      if (json.ok && Array.isArray(json.notifications)) {
        setNotifications(json.notifications);
      }
    } catch {
      // ignore
    } finally {
      setLoadingNotif(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // ─── Supabase Realtime: 새 알림 실시간 구독 ─────────────────────────────
  useEffect(() => {
    if (!userId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications_user_${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const newNotif: DbNotification = {
            id: String(row.id),
            userId: String(row.user_id),
            message: String(row.message ?? ""),
            link: typeof row.link === "string" ? row.link : null,
            isRead: Boolean(row.is_read),
            createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
          };
          setNotifications((prev) => [newNotif, ...prev]);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  // ─── 알림 열기 → 전체 읽음 처리 ─────────────────────────────────────────
  const handleOpen = useCallback(async (next: boolean) => {
    setOpen(next);
    if (!next || !userId) return;
    const unread = notifications.filter((n) => !n.isRead);
    if (unread.length === 0) return;
    try {
      await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ markAll: true }),
      });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    } catch {
      // ignore
    }
  }, [userId, notifications]);

  const handleDeleteAll = async () => {
    try {
      await fetch("/api/notifications?all=true", {
        method: "DELETE",
        credentials: "same-origin",
      });
      setNotifications([]);
    } catch {
      // ignore
    }
  };

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const hasPendingSettlement = pendingSettlements.length > 0;
  const hasUnread = unreadCount > 0;
  const totalBadgeCount = unreadCount + pendingSettlements.length;

  // ─── 로그인 안 된 경우 ─────────────────────────────────────────────────
  if (!userId) {
    return (
      <button className="relative p-2 rounded-lg hover:bg-secondary transition-colors hidden sm:flex">
        <Bell className="size-5 text-muted-foreground" />
      </button>
    );
  }

  return (
    <DropdownMenu open={open} onOpenChange={handleOpen}>
      <DropdownMenuTrigger asChild>
        <button className="relative p-2 rounded-lg hover:bg-secondary transition-colors hidden sm:flex">
          <Bell className={cn("size-5", hasUnread || hasPendingSettlement ? "text-foreground" : "text-muted-foreground")} />
          {hasPendingSettlement && (
            <span className="absolute top-1 right-1 size-2.5 rounded-full bg-chart-5 ring-2 ring-background animate-pulse" />
          )}
          {!hasPendingSettlement && hasUnread && (
            <span className="absolute top-1 right-1 size-2 rounded-full bg-neon-blue ring-1 ring-background" />
          )}
          {totalBadgeCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-destructive text-[10px] font-bold text-destructive-foreground px-1 ring-2 ring-background">
              {totalBadgeCount > 99 ? "99+" : totalBadgeCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-[380px] max-h-[520px] overflow-y-auto">
        <DropdownMenuLabel className="flex items-center justify-between sticky top-0 bg-popover z-10 pb-2">
          <span className="font-semibold">알림</span>
          <div className="flex items-center gap-1">
            {notifications.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground"
                onClick={handleDeleteAll}
              >
                <Trash2 className="size-3 mr-1" />
                전체 삭제
              </Button>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {/* ─── 결과 입력 대기 보트 ───────────────────────────────────── */}
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
                className="flex flex-col items-start gap-1 border-l-2 border-chart-5/50 pl-3 ml-1 my-0.5 cursor-pointer"
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
            {notifications.length > 0 && <DropdownMenuSeparator />}
          </>
        )}

        {/* ─── DB 알림 (댓글 등) ─────────────────────────────────────── */}
        {notifications.length > 0 && (
          <>
            <div className="px-2 py-1">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                <MessageSquare className="size-3" />
                활동 알림
                {unreadCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-neon-blue/15 text-neon-blue text-[10px] font-bold">
                    {unreadCount} 새 알림
                  </span>
                )}
              </p>
            </div>
            {notifications.map((n) => (
              <DropdownMenuItem
                key={n.id}
                onSelect={(e) => {
                  e.preventDefault();
                  setOpen(false);
                  if (n.link) router.push(n.link);
                }}
                className={cn(
                  "flex flex-col items-start gap-1 cursor-pointer my-0.5",
                  !n.isRead && "bg-neon-blue/5 border-l-2 border-neon-blue/40 pl-3 ml-1",
                )}
              >
                <div className="flex items-center gap-2 w-full">
                  {!n.isRead && (
                    <span className="size-1.5 rounded-full bg-neon-blue shrink-0" />
                  )}
                  <div className="text-sm text-foreground line-clamp-2 flex-1 leading-snug">
                    {n.message}
                  </div>
                </div>
                <div className="text-[11px] text-muted-foreground/70 pl-0.5">
                  {new Date(n.createdAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}
                </div>
              </DropdownMenuItem>
            ))}
          </>
        )}

        {/* ─── 비어 있을 때 ────────────────────────────────────────────── */}
        {pendingSettlements.length === 0 && notifications.length === 0 && (
          <div className="px-2 py-10 text-center text-sm text-muted-foreground">
            {loadingNotif ? (
              <span className="inline-flex items-center gap-2">
                <span className="size-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                불러오는 중...
              </span>
            ) : (
              <>
                <CheckCheck className="size-8 mx-auto mb-2 text-muted-foreground/40" />
                알림이 없습니다.
              </>
            )}
          </div>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
