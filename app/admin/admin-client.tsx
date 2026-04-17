"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  Ban,
  Check,
  ChevronLeft,
  ChevronRight,
  Coins,
  Gift,
  LayoutDashboard,
  RefreshCw,
  Settings2,
  Shield,
  TrendingUp,
  Users,
  X,
  LayoutList,
} from "lucide-react";
import { Navbar } from "@/components/navbar";
import { LevelIcon } from "@/components/level-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getUidByDisplayName, useUserPointsBalance } from "@/lib/points";
import {
  blockUserByDisplayName,
  getUserModerationStatus,
  liftAllModerationForUser,
  suspendUserByDisplayName,
} from "@/lib/user-moderation";
import { useIsAdmin } from "@/hooks/use-is-admin";
import {
  getAdminUserList,
  getPebbleStats,
  grantPebblesToAll,
  grantPebblesToUser,
  grantPebblesByUserId,
  type AdminUserEntry,
  type PebbleStats,
} from "@/lib/admin-stats";
import { cn } from "@/lib/utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

// ─── 통계 카드 ────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4 space-y-1",
        accent
          ? "border-chart-5/30 bg-chart-5/5"
          : "border-border/60 bg-card/60",
      )}
    >
      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
        <Icon className={cn("size-3.5", accent ? "text-chart-5" : "")} />
        <span>{label}</span>
      </div>
      <p className={cn("text-2xl font-bold", accent ? "text-chart-5" : "text-foreground")}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ─── 유저 활동 보기 ───────────────────────────────────────────────────────────

function UserActivityDialog({
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

// ─── 유저 행 ─────────────────────────────────────────────────────────────────

function UserRow({
  entry,
  rank,
  onGrantDone,
}: {
  entry: AdminUserEntry;
  rank: number;
  onGrantDone: () => void;
}) {
  const [open, setOpen]     = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg]       = useState<{ ok: boolean; text: string } | null>(null);

  const cachedUid = useMemo(
    () => getUidByDisplayName(entry.displayName),
    [entry.displayName],
  );
  const [modTick, setModTick] = useState(0);
  useEffect(() => {
    const fn = () => setModTick((n) => n + 1);
    window.addEventListener("voters:moderationUpdated", fn as EventListener);
    return () =>
      window.removeEventListener("voters:moderationUpdated", fn as EventListener);
  }, []);
  const modStatus = useMemo(
    () => getUserModerationStatus(entry.displayName, cachedUid),
    [entry.displayName, cachedUid, modTick],
  );
  const [suspendDays, setSuspendDays] = useState("7");
  const [modMsg, setModMsg] = useState<string | null>(null);
  const [activityOpen, setActivityOpen] = useState(false);

  const handleGrant = () => {
    const n = parseInt(amount, 10);
    if (!n || n <= 0) { setMsg({ ok: false, text: "올바른 금액을 입력하세요" }); return; }
    const ok = grantPebblesToUser(entry.displayName, n, reason || "운영자 지급");
    if (ok) {
      setMsg({ ok: true, text: `${n.toLocaleString()} P 지급 완료` });
      setAmount(""); setReason("");
      onGrantDone();
      setTimeout(() => { setOpen(false); setMsg(null); }, 1500);
    } else {
      setMsg({ ok: false, text: "userId를 찾을 수 없습니다 (유저가 로그인한 적 없을 수 있음)" });
    }
  };

  return (
    <>
      <tr className="border-b border-border/30 hover:bg-secondary/20 transition-colors">
        <td className="px-4 py-3 text-sm text-muted-foreground text-center w-10">{rank}</td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <LevelIcon level={entry.level} size={16} />
            <span className="text-sm font-medium text-foreground">{entry.displayName}</span>
            {entry.isAdmin && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-chart-5/20 text-chart-5 border border-chart-5/30 leading-none">
                운영자
              </span>
            )}
          </div>
        </td>
        <td className="px-4 py-3 text-xs text-muted-foreground">{entry.levelLabel}</td>
        <td className="px-4 py-3 text-right">
          <span className={cn("text-sm font-semibold tabular-nums", entry.isAdmin ? "text-chart-5" : "text-foreground")}>
            {entry.pebbles.toLocaleString()} P
          </span>
        </td>
        <td className="px-4 py-3 text-right text-xs text-muted-foreground tabular-nums">
          {entry.isAdmin ? "고정" : `${entry.totalWealth.toLocaleString()} P`}
        </td>
        <td className="px-4 py-3 text-right">
          {!entry.isAdmin && (
            <button
              onClick={() => { setOpen((v) => !v); setMsg(null); }}
              className="text-xs px-2 py-1 rounded-md bg-chart-5/10 text-chart-5 border border-chart-5/20 hover:bg-chart-5/20 transition-colors"
            >
              지급
            </button>
          )}
        </td>
        <td className="px-4 py-3 text-center">
          <button
            type="button"
            onClick={() => setActivityOpen(true)}
            className="text-xs px-2 py-1 rounded-md bg-secondary/80 text-foreground border border-border/60 hover:bg-secondary whitespace-nowrap"
          >
            보기
          </button>
          <UserActivityDialog
            displayName={entry.displayName}
            knownUserId={cachedUid}
            open={activityOpen}
            onOpenChange={setActivityOpen}
          />
        </td>
        <td className="px-4 py-3 align-top">
          {!entry.isAdmin && (
            <div className="flex flex-col gap-1.5 min-w-[200px]">
              <div className="flex flex-wrap gap-1 items-center text-[10px]">
                {modStatus.blocked && (
                  <span className="px-1.5 py-0.5 rounded bg-destructive/15 text-destructive border border-destructive/30 font-semibold">
                    차단
                  </span>
                )}
                {!modStatus.blocked && modStatus.suspendedUntil && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/25 font-semibold max-w-[180px] truncate" title={new Date(modStatus.suspendedUntil).toLocaleString("ko-KR")}>
                    정지 ~{new Date(modStatus.suspendedUntil).toLocaleString("ko-KR", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
                {!modStatus.blocked && !modStatus.suspendedUntil && (
                  <span className="text-muted-foreground">—</span>
                )}
              </div>
              <div className="flex flex-wrap gap-1 items-center">
                <button
                  type="button"
                  onClick={() => {
                    setModMsg(null);
                    if (!window.confirm(`${entry.displayName} 님을 차단할까요? (글·댓글·보트 불가)`)) return;
                    const ok = blockUserByDisplayName(entry.displayName, cachedUid);
                    setModMsg(ok ? "차단했습니다" : "적용할 수 없습니다 (운영자 등)");
                    onGrantDone();
                  }}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-destructive/40 text-destructive hover:bg-destructive/10"
                >
                  <Ban className="size-3 inline mr-0.5 align-text-bottom" />
                  차단
                </button>
                <Select value={suspendDays} onValueChange={setSuspendDays}>
                  <SelectTrigger className="h-7 w-[72px] text-[10px] px-2">
                    <SelectValue placeholder="일수" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1일</SelectItem>
                    <SelectItem value="3">3일</SelectItem>
                    <SelectItem value="7">7일</SelectItem>
                    <SelectItem value="14">14일</SelectItem>
                    <SelectItem value="30">30일</SelectItem>
                  </SelectContent>
                </Select>
                <button
                  type="button"
                  onClick={() => {
                    setModMsg(null);
                    const d = parseInt(suspendDays, 10);
                    if (!window.confirm(`${entry.displayName} 님을 ${d}일간 정지할까요?`)) return;
                    const ok = suspendUserByDisplayName(entry.displayName, d, cachedUid);
                    setModMsg(ok ? `${d}일 정지 적용` : "적용할 수 없습니다 (운영자 등)");
                    onGrantDone();
                  }}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-amber-500/40 text-amber-700 dark:text-amber-400 hover:bg-amber-500/10"
                >
                  정지
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setModMsg(null);
                    liftAllModerationForUser(entry.displayName, cachedUid);
                    setModMsg("제재 해제");
                    onGrantDone();
                  }}
                  className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:bg-secondary"
                >
                  해제
                </button>
              </div>
              {modMsg && (
                <span className="text-[10px] text-chart-5">{modMsg}</span>
              )}
            </div>
          )}
        </td>
      </tr>

      {/* 개별 지급 인라인 폼 */}
      {open && !entry.isAdmin && (
        <tr className="border-b border-border/20 bg-chart-5/3">
          <td colSpan={8} className="px-6 py-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground shrink-0">
                <strong className="text-foreground">{entry.displayName}</strong> 에게 지급
              </span>
              <Input
                type="number"
                placeholder="페블 수량"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="h-7 w-28 text-xs"
                min={1}
              />
              <Input
                placeholder="사유 (선택)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="h-7 w-40 text-xs"
              />
              <button
                onClick={handleGrant}
                className="h-7 px-3 rounded-md text-xs font-semibold bg-chart-5 text-white hover:opacity-90 transition-opacity flex items-center gap-1"
              >
                <Check className="size-3" /> 지급
              </button>
              <button
                onClick={() => { setOpen(false); setMsg(null); }}
                className="h-7 px-2 rounded-md text-xs text-muted-foreground hover:bg-secondary transition-colors"
              >
                <X className="size-3" />
              </button>
              {msg && (
                <span className={cn("text-xs", msg.ok ? "text-green-400" : "text-red-400")}>
                  {msg.text}
                </span>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── 메인 ─────────────────────────────────────────────────────────────────────

export function AdminClient() {
  const router = useRouter();
  const { userId, points: balance } = useUserPointsBalance();
  const { isAdmin, loading } = useIsAdmin();

  const [users, setUsers]   = useState<AdminUserEntry[]>([]);
  const [stats, setStats]   = useState<PebbleStats | null>(null);
  const [refreshed, setRefreshed] = useState(0);

  // 정렬 상태
  type SortCol = "name" | "level" | "pebbles";
  type SortDir = "asc" | "desc";
  const [sortCol, setSortCol] = useState<SortCol>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // 페이지네이션
  const PAGE_SIZE = 10;
  const [page, setPage] = useState(1);

  // 전체 지급 상태
  const [allAmount, setAllAmount] = useState("");
  const [allReason, setAllReason] = useState("");
  const [allConfirm, setAllConfirm] = useState(false);
  const [allMsg, setAllMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // userId 직접 지급 상태
  const [directUid, setDirectUid]       = useState("");
  const [directAmount, setDirectAmount] = useState("");
  const [directReason, setDirectReason] = useState("");
  const [directMsg, setDirectMsg]       = useState<{ ok: boolean; text: string } | null>(null);

  const load = () => {
    setUsers(getAdminUserList());
    setStats(getPebbleStats());
  };

  useEffect(() => {
    load();
  }, [refreshed]);

  // 정렬 기준이 바뀌면 1페이지로 이동
  useEffect(() => { setPage(1); }, [sortCol, sortDir]);

  // 비관리자 접근 차단
  useEffect(() => {
    if (!loading && !isAdmin) router.replace("/");
  }, [loading, isAdmin, router]);

  const handleGrantAll = () => {
    const n = parseInt(allAmount, 10);
    if (!n || n <= 0) { setAllMsg({ ok: false, text: "올바른 금액을 입력하세요" }); return; }
    const result = grantPebblesToAll(n, allReason || "운영자 일괄 지급");
    setAllMsg({
      ok: true,
      text: `${result.succeeded.length}명에게 ${n.toLocaleString()} P 지급 완료${result.failed.length > 0 ? ` (${result.failed.length}명 실패)` : ""}`,
    });
    setAllAmount(""); setAllReason(""); setAllConfirm(false);
    setRefreshed((v) => v + 1);
    setTimeout(() => setAllMsg(null), 3000);
  };

  const sortedUsers = useMemo(() => {
    const dir = sortDir === "asc" ? 1 : -1;
    return [...users].sort((a, b) => {
      if (sortCol === "name")    return dir * a.displayName.localeCompare(b.displayName, "ko");
      if (sortCol === "level")   return dir * (a.level - b.level);
      if (sortCol === "pebbles") return dir * (a.pebbles - b.pebbles);
      return 0;
    });
  }, [users, sortCol, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedUsers.length / PAGE_SIZE));
  const pagedUsers = sortedUsers.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const handleSort = (col: "name" | "level" | "pebbles") => {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
    setPage(1);
  };

  const handleDirectGrant = () => {
    const uid = directUid.trim();
    const n   = parseInt(directAmount, 10);
    if (!uid)       { setDirectMsg({ ok: false, text: "userId를 입력하세요" }); return; }
    if (!n || n <= 0) { setDirectMsg({ ok: false, text: "올바른 금액을 입력하세요" }); return; }
    const ok = grantPebblesByUserId(uid, n, directReason || "운영자 직접 지급");
    if (ok) {
      setDirectMsg({ ok: true, text: `${n.toLocaleString()} P 지급 완료` });
      setDirectAmount(""); setDirectReason("");
      setRefreshed((v) => v + 1);
      setTimeout(() => setDirectMsg(null), 3000);
    } else {
      setDirectMsg({ ok: false, text: "운영자 계정이거나 잘못된 userId입니다" });
    }
  };

  if (loading || !isAdmin) return null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar balance={balance} userId={userId} />

      {/* 헤더 */}
      <div className="border-b border-border/50 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            onClick={() => router.push("/")}
            className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-5" />
          </button>
          <Settings2 className="size-5 text-chart-5" />
          <h1 className="text-lg font-bold text-foreground">관리 페이지</h1>
          <span className="text-xs px-2 py-0.5 rounded-full bg-chart-5/15 text-chart-5 border border-chart-5/30 font-semibold ml-1">
            운영자 전용
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" asChild>
              <Link href="/admin/betting">
                <LayoutDashboard className="size-3.5" />
                베팅 상세 통계
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs text-muted-foreground"
              onClick={() => setRefreshed((n) => n + 1)}
            >
              <RefreshCw className="size-3.5" />
              새로고침
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-8">

        {/* ── 페블 통계 ── */}
        {stats && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="size-4 text-chart-5" />
              <h2 className="font-bold text-foreground">페블 통계</h2>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              <StatCard
                icon={Users}
                label="전체 유저"
                value={`${stats.totalUsers}명`}
                sub={`일반 ${stats.regularUsers}명`}
              />
              <StatCard
                icon={Coins}
                label="일반 유저 총 보유 페블"
                value={`${stats.totalPebbles.toLocaleString()} P`}
                sub="운영자 제외"
                accent
              />
              <StatCard
                icon={Coins}
                label="1인 평균 보유 페블"
                value={`${stats.avgPebbles.toLocaleString()} P`}
                sub="일반 유저 기준"
              />
              <StatCard
                icon={Coins}
                label="최다 보유 페블"
                value={`${stats.maxPebbles.toLocaleString()} P`}
                sub="단일 유저 최대"
              />
              <StatCard
                icon={Coins}
                label="지급된 환영 보너스"
                value={`${stats.totalWelcomeBonus.toLocaleString()} P`}
                sub={`가입자 약 ${Math.round(stats.totalWelcomeBonus / 3000)}명 추정`}
              />
              <StatCard
                icon={Shield}
                label="운영자 고정 잔액"
                value={`${stats.adminPebbles.toLocaleString()} P`}
                sub="통계 제외"
              />
            </div>
          </section>
        )}

        {/* ── 페블 지급 ── */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Gift className="size-4 text-chart-5" />
            <h2 className="font-bold text-foreground">페블 지급</h2>
          </div>

          <div className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-4">
            {/* 전체 지급 */}
            <div className="space-y-2">
              <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Users className="size-3.5 text-chart-5" />
                전체 유저 일괄 지급
                <span className="text-xs text-muted-foreground font-normal">(운영자 제외)</span>
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <Input
                  type="number"
                  placeholder="페블 수량"
                  value={allAmount}
                  onChange={(e) => { setAllAmount(e.target.value); setAllConfirm(false); setAllMsg(null); }}
                  className="h-8 w-32 text-sm"
                  min={1}
                />
                <Input
                  placeholder="지급 사유 (선택)"
                  value={allReason}
                  onChange={(e) => setAllReason(e.target.value)}
                  className="h-8 w-48 text-sm"
                />
                {!allConfirm ? (
                  <Button
                    size="sm"
                    className="h-8 gap-1.5 text-xs font-semibold"
                    style={{ background: "var(--chart-5)", color: "white" }}
                    onClick={() => {
                      const n = parseInt(allAmount, 10);
                      if (!n || n <= 0) { setAllMsg({ ok: false, text: "올바른 금액을 입력하세요" }); return; }
                      setAllConfirm(true);
                    }}
                  >
                    <Gift className="size-3.5" />
                    전체 지급
                  </Button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-amber-400 font-semibold">
                      {users.filter(u => !u.isAdmin).length}명에게 {parseInt(allAmount || "0").toLocaleString()} P 지급합니다. 확인하시겠습니까?
                    </span>
                    <button
                      onClick={handleGrantAll}
                      className="h-7 px-3 rounded-md text-xs font-semibold bg-chart-5 text-white hover:opacity-90 flex items-center gap-1"
                    >
                      <Check className="size-3" /> 확인
                    </button>
                    <button
                      onClick={() => setAllConfirm(false)}
                      className="h-7 px-2 rounded-md text-xs text-muted-foreground hover:bg-secondary"
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                )}
                {allMsg && (
                  <span className={cn("text-xs", allMsg.ok ? "text-green-400" : "text-red-400")}>
                    {allMsg.text}
                  </span>
                )}
              </div>
            </div>

            <div className="border-t border-border/40 pt-3 space-y-2">
              <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                <Shield className="size-3.5 text-chart-5" />
                userId 직접 지급
                <span className="text-xs text-muted-foreground font-normal">
                  (닉네임 조회 불가 시 사용 — Supabase UUID 입력)
                </span>
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <Input
                  placeholder="Supabase userId (UUID)"
                  value={directUid}
                  onChange={(e) => { setDirectUid(e.target.value); setDirectMsg(null); }}
                  className="h-8 w-72 text-xs font-mono"
                />
                <Input
                  type="number"
                  placeholder="페블 수량"
                  value={directAmount}
                  onChange={(e) => setDirectAmount(e.target.value)}
                  className="h-8 w-28 text-xs"
                  min={1}
                />
                <Input
                  placeholder="지급 사유 (선택)"
                  value={directReason}
                  onChange={(e) => setDirectReason(e.target.value)}
                  className="h-8 w-40 text-xs"
                />
                <Button
                  size="sm"
                  className="h-8 gap-1.5 text-xs font-semibold"
                  style={{ background: "var(--chart-5)", color: "white" }}
                  onClick={handleDirectGrant}
                >
                  <Check className="size-3.5" />
                  지급
                </Button>
                {directMsg && (
                  <span className={cn("text-xs", directMsg.ok ? "text-green-400" : "text-red-400")}>
                    {directMsg.text}
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                개별 닉네임 지급은 아래 유저 목록에서 <strong className="text-foreground">지급</strong> 버튼을 클릭하세요.
              </p>
            </div>
          </div>
        </section>

        {/* ── 유저 목록 ── */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-chart-5" />
            <h2 className="font-bold text-foreground">유저 목록</h2>
            <span className="text-xs text-muted-foreground bg-secondary/60 rounded-full px-2 py-0.5">
              {users.length}명
            </span>
          </div>

          <div className="rounded-xl border border-border/60 bg-card/60 overflow-hidden">
            {users.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <Users className="size-10 opacity-30" />
                <p className="text-sm">아직 유저 데이터가 없습니다</p>
                <p className="text-xs">유저가 로그인하면 자동으로 표시됩니다</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-border/50 bg-secondary/30">
                        <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground text-center w-10">#</th>

                        {/* 닉네임 — 가나다순 */}
                        <th className="px-4 py-2.5 text-left">
                          <button
                            onClick={() => handleSort("name")}
                            className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors group"
                          >
                            닉네임
                            {sortCol === "name"
                              ? sortDir === "asc"
                                ? <ArrowUp className="size-3 text-chart-5" />
                                : <ArrowDown className="size-3 text-chart-5" />
                              : <ArrowUpDown className="size-3 opacity-0 group-hover:opacity-50 transition-opacity" />}
                          </button>
                        </th>

                        {/* 레벨순 */}
                        <th className="px-4 py-2.5 text-left">
                          <button
                            onClick={() => handleSort("level")}
                            className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors group"
                          >
                            레벨
                            {sortCol === "level"
                              ? sortDir === "asc"
                                ? <ArrowUp className="size-3 text-chart-5" />
                                : <ArrowDown className="size-3 text-chart-5" />
                              : <ArrowUpDown className="size-3 opacity-0 group-hover:opacity-50 transition-opacity" />}
                          </button>
                        </th>

                        {/* 보유 페블순 */}
                        <th className="px-4 py-2.5 text-right">
                          <button
                            onClick={() => handleSort("pebbles")}
                            className="flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors ml-auto group"
                          >
                            보유 페블
                            {sortCol === "pebbles"
                              ? sortDir === "asc"
                                ? <ArrowUp className="size-3 text-chart-5" />
                                : <ArrowDown className="size-3 text-chart-5" />
                              : <ArrowUpDown className="size-3 opacity-0 group-hover:opacity-50 transition-opacity" />}
                          </button>
                        </th>

                        <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground text-right">총 누적</th>
                        <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground text-right">지급</th>
                        <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground text-center w-[4.5rem]">
                          활동
                        </th>
                        <th className="px-4 py-2.5 text-xs font-semibold text-muted-foreground text-left min-w-[220px]">
                          제재
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedUsers.map((entry, i) => (
                        <UserRow
                          key={entry.displayName}
                          entry={entry}
                          rank={(page - 1) * PAGE_SIZE + i + 1}
                          onGrantDone={() => setRefreshed((v) => v + 1)}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* 페이지네이션 */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between px-4 py-3 border-t border-border/30 bg-secondary/10">
                    <span className="text-xs text-muted-foreground">
                      {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, sortedUsers.length)} / 총 {sortedUsers.length}명
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        disabled={page === 1}
                        onClick={() => setPage((p) => p - 1)}
                        className="p-1 rounded-md hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronLeft className="size-4" />
                      </button>
                      {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((p) => (
                        <button
                          key={p}
                          onClick={() => setPage(p)}
                          className={cn(
                            "w-7 h-7 rounded-md text-xs font-semibold transition-colors",
                            p === page
                              ? "bg-chart-5 text-white"
                              : "hover:bg-secondary text-muted-foreground",
                          )}
                        >
                          {p}
                        </button>
                      ))}
                      <button
                        disabled={page === totalPages}
                        onClick={() => setPage((p) => p + 1)}
                        className="p-1 rounded-md hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                      >
                        <ChevronRight className="size-4" />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <p className="text-xs text-muted-foreground px-1">
            * 유저 목록은 사이트를 방문한 유저들의 캐시 데이터 기준입니다.
            총 누적 = 레벨업 소비 페블 + 현재 보유 페블.
          </p>
        </section>
      </div>
    </div>
  );
}
