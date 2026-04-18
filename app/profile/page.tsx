"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  Loader2,
  Lock,
  MessageSquare,
  Pencil,
  UserRound,
} from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { MyCreatedBetsList } from "@/components/user/my-created-bets-list";
import { LevelIcon } from "@/components/level-icon";
import { useUserPointsBalance } from "@/lib/points";
import {
  getTierByLevel,
  levelLabelTrackingClassName,
} from "@/lib/level-system";
import { getUpgradeCost, getDailyReward } from "@/lib/levelConfig";
import type { BoardPost } from "@/lib/board";
import type { Comment } from "@/lib/comments";
import { createClient } from "@/utils/supabase/client";
import { isAdminEmail } from "@/lib/admin";
import { cn } from "@/lib/utils";

type ProfileTab = "me" | "posts" | "comments" | "my-bets" | "password";

export default function ProfilePage() {
  const { points: balance, userId } = useUserPointsBalance();
  const [tab, setTab] = useState<ProfileTab>("me");
  const [sessionState, setSessionState] = useState<"loading" | "in" | "out">("loading");

  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [canChangePassword, setCanChangePassword] = useState(false);

  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [postsLoading, setPostsLoading] = useState(false);
  const [comments, setComments] = useState<(Comment & { postTitle?: string })[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [myBetsCount, setMyBetsCount] = useState<number | null>(null);
  const [myWaitingBetsCount, setMyWaitingBetsCount] = useState(0);

  const [pwdCurrent, setPwdCurrent] = useState("");
  const [pwdNew, setPwdNew] = useState("");
  const [pwdConfirm, setPwdConfirm] = useState("");
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  // 내 정보 수정 다이얼로그
  const [editOpen, setEditOpen] = useState(false);
  const [editNickname, setEditNickname] = useState("");
  const [editNickBusy, setEditNickBusy] = useState(false);
  const [editNickMsg, setEditNickMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [userLevel, setUserLevel] = useState<number>(1);
  const [levelUpOpen, setLevelUpOpen] = useState(false);
  const [levelUpBusy, setLevelUpBusy] = useState(false);
  const [levelUpMsg, setLevelUpMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  useEffect(() => {
    const supabase = createClient();

    const loadUser = async () => {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser();
      if (error || !user) {
        setUserName("");
        setUserEmail("");
        setCanChangePassword(false);
        setSessionState("out");
        return;
      }
      const name =
        user.user_metadata?.full_name ??
        user.user_metadata?.name ??
        user.email?.split("@")[0] ??
        "";
      setUserName(name);
      setUserEmail(user.email ?? "");
      setCanChangePassword(user.identities?.some((i) => i.provider === "email") ?? false);
      setSessionState("in");
    };

    void loadUser();
    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      void loadUser();
    });

    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  // DB에서 내 게시글 로드
  useEffect(() => {
    if (!userId || userId === "anon") return;
    setPostsLoading(true);
    void fetch(`/api/board-posts?authorId=${encodeURIComponent(userId)}&limit=100`, {
      credentials: "same-origin",
    })
      .then((r) => r.json())
      .then((j: { ok?: boolean; posts?: BoardPost[] }) => {
        if (j.ok && Array.isArray(j.posts)) setPosts(j.posts);
      })
      .catch(() => null)
      .finally(() => setPostsLoading(false));
  }, [userId]);

  // DB에서 내 댓글 로드
  useEffect(() => {
    if (!userId || userId === "anon") return;
    setCommentsLoading(true);
    void fetch(`/api/post-comments?authorId=${encodeURIComponent(userId)}&limit=100`, {
      credentials: "same-origin",
    })
      .then((r) => r.json())
      .then((j: { ok?: boolean; comments?: (Comment & { postTitle?: string })[] }) => {
        if (j.ok && Array.isArray(j.comments)) setComments(j.comments);
      })
      .catch(() => null)
      .finally(() => setCommentsLoading(false));
  }, [userId]);

  // DB에서 레벨 로드
  useEffect(() => {
    if (!userId || userId === "anon") return;
    void fetch("/api/user/profile-level", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { level?: number }) => {
        if (typeof j.level === "number") setUserLevel(j.level);
      })
      .catch(() => null);
  }, [userId]);

  useEffect(() => {
    if (!canChangePassword && tab === "password") setTab("me");
  }, [canChangePassword, tab]);

  useEffect(() => {
    if (tab !== "password") {
      setPwdCurrent("");
      setPwdNew("");
      setPwdConfirm("");
      setPwdMsg(null);
    }
  }, [tab]);

  const isAdmin = isAdminEmail(userEmail);

  const levelUpCost = getUpgradeCost(userLevel);
  const canLevelUp = userLevel < 56 && isFinite(levelUpCost) && balance >= levelUpCost;
  const currentTier = getTierByLevel(userLevel);
  const nextTier = userLevel < 56 ? getTierByLevel(userLevel + 1) : null;
  const currentDailyReward = getDailyReward(userLevel);
  const nextDailyReward = userLevel < 56 ? getDailyReward(userLevel + 1) : null;
  // 진행도: 현재 보유 / 필요 비용 (0~1)
  const levelProgress = isFinite(levelUpCost) ? Math.min(1, balance / levelUpCost) : 1;

  const handleLevelUp = () => {
    if (!canLevelUp || !userId || userId === "anon" || levelUpBusy) return;
    setLevelUpBusy(true);
    setLevelUpMsg(null);
    void (async () => {
      try {
        const res = await fetch("/api/pebbles/level-up", {
          method: "POST",
          credentials: "same-origin",
        });
        const j = (await res.json()) as {
          ok?: boolean;
          error?: string;
          message?: string;
          newLevel?: number;
          newBalance?: number;
        };
        if (res.ok && j.ok && j.newLevel) {
          setUserLevel(j.newLevel);
          setLevelUpMsg({ type: "ok", text: `Lv.${j.newLevel} 달성! 🎉` });
          // 잔액 갱신 트리거
          window.dispatchEvent(new CustomEvent("voters:balanceUpdated"));
          setTimeout(() => setLevelUpOpen(false), 1200);
        } else {
          setLevelUpMsg({ type: "err", text: j.message ?? j.error ?? "레벨업 실패" });
        }
      } catch {
        setLevelUpMsg({ type: "err", text: "네트워크 오류가 발생했습니다" });
      } finally {
        setLevelUpBusy(false);
      }
    })();
  };

  // API가 이미 authorId로 필터링해서 반환하므로 추가 필터링 불필요
  const myPosts = useMemo(
    () => [...posts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [posts],
  );

  const myComments = useMemo(
    () => [...comments].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [comments],
  );

  const openEditDialog = () => {
    setEditNickname(userName);
    setEditNickMsg(null);
    setEditOpen(true);
  };

  const handleNicknameChange = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const trimmed = editNickname.trim();
    if (!trimmed) {
      setEditNickMsg({ type: "err", text: "닉네임을 입력해 주세요." });
      return;
    }
    if (trimmed === userName) {
      setEditNickMsg({ type: "err", text: "현재 닉네임과 동일합니다." });
      return;
    }
    setEditNickBusy(true);
    setEditNickMsg(null);
    try {
      const res = await fetch("/api/user/update-nickname", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nickname: trimmed }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) {
        if (j.error === "nickname_taken") {
          setEditNickMsg({ type: "err", text: "이미 사용 중인 닉네임입니다. 다른 닉네임을 입력해 주세요." });
        } else {
          setEditNickMsg({ type: "err", text: j.error ?? "닉네임 변경에 실패했습니다." });
        }
        return;
      }
      setUserName(trimmed);
      setEditNickMsg({ type: "ok", text: "닉네임이 변경되었습니다." });
      // 세션 갱신 → auth-button 닉네임 즉시 반영
      const supabase = createClient();
      await supabase.auth.refreshSession();
      window.dispatchEvent(new CustomEvent("voters:nicknameUpdated", { detail: { nickname: trimmed } }));
    } catch {
      setEditNickMsg({ type: "err", text: "네트워크 오류가 발생했습니다." });
    } finally {
      setEditNickBusy(false);
    }
  };

  const handlePasswordChange = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setPwdMsg(null);
    const minLen = 6;
    if (pwdNew.length < minLen) {
      setPwdMsg({ type: "err", text: `새 비밀번호는 ${minLen}자 이상이어야 합니다.` });
      return;
    }
    if (pwdNew !== pwdConfirm) {
      setPwdMsg({ type: "err", text: "새 비밀번호 확인이 일치하지 않습니다." });
      return;
    }
    if (!userEmail) {
      setPwdMsg({ type: "err", text: "이메일 정보를 찾을 수 없습니다." });
      return;
    }
    setPwdBusy(true);
    const supabase = createClient();
    const { error: signErr } = await supabase.auth.signInWithPassword({
      email: userEmail,
      password: pwdCurrent,
    });
    if (signErr) {
      setPwdBusy(false);
      setPwdMsg({ type: "err", text: "현재 비밀번호가 올바르지 않습니다." });
      return;
    }
    const { error: upErr } = await supabase.auth.updateUser({ password: pwdNew });
    setPwdBusy(false);
    if (upErr) {
      setPwdMsg({
        type: "err",
        text: upErr.message.includes("Password")
          ? "비밀번호 정책을 확인해 주세요. (길이·복잡도 등)"
          : upErr.message,
      });
      return;
    }
    setPwdCurrent("");
    setPwdNew("");
    setPwdConfirm("");
    setPwdMsg({ type: "ok", text: "비밀번호가 변경되었습니다." });
  };

  if (sessionState === "loading") {
    return (
      <div className="min-h-screen bg-background">
        <Navbar balance={balance} userId={userId} />
        <div className="flex flex-col items-center justify-center gap-3 py-24">
          <Loader2 className="size-10 animate-spin text-chart-5" aria-hidden />
          <p className="text-sm text-muted-foreground">불러오는 중…</p>
        </div>
      </div>
    );
  }

  if (sessionState === "out") {
    return (
      <div className="min-h-screen bg-background">
        <Navbar balance={balance} userId={userId} />
        <main className="mx-auto max-w-md px-4 py-16 text-center">
          <p className="text-muted-foreground">로그인 후 프로필을 이용할 수 있습니다.</p>
          <Button className="mt-6" asChild>
            <Link href="/login">로그인</Link>
          </Button>
        </main>
      </div>
    );
  }

  const tabGridClass = canChangePassword
    ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-5"
    : "grid-cols-2 sm:grid-cols-4";

  return (
    <div className="min-h-screen bg-background">
      <Navbar balance={balance} userId={userId} />

      <main className="mx-auto max-w-3xl px-4 py-6 md:py-10">
        <div className="mb-6 flex items-center gap-3">
          <Button variant="ghost" size="icon" className="shrink-0" asChild>
            <Link href="/" aria-label="홈으로">
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
          <div>
            <h1 className="text-xl font-bold text-foreground md:text-2xl">프로필</h1>
            <p className="mt-0.5 text-xs text-muted-foreground">
              계정·레벨·활동 내역·비밀번호를 한곳에서 관리합니다.
            </p>
          </div>
        </div>

        <Tabs value={tab} onValueChange={(v) => setTab(v as ProfileTab)}>
          <TabsList
            className={cn(
              "!grid h-auto min-h-10 w-full gap-1 rounded-lg bg-muted p-[3px] text-muted-foreground",
              tabGridClass,
            )}
          >
            <TabsTrigger value="me" className="text-xs sm:text-sm min-h-[36px]">
              내 정보
            </TabsTrigger>
            <TabsTrigger value="posts" className="text-xs sm:text-sm min-h-[36px]">
              내 글 ({myPosts.length})
            </TabsTrigger>
            <TabsTrigger value="comments" className="text-xs sm:text-sm min-h-[36px]">
              댓글 ({myComments.length})
            </TabsTrigger>
            <TabsTrigger value="my-bets" className="relative text-xs sm:text-sm min-h-[36px]">
              내 보트
              {myBetsCount !== null ? ` (${myBetsCount})` : ""}
              {myWaitingBetsCount > 0 && (
                <span className="ml-1 inline-flex items-center justify-center rounded-full bg-amber-500 text-white text-[10px] font-bold min-w-[16px] h-4 px-1">
                  {myWaitingBetsCount}
                </span>
              )}
            </TabsTrigger>
            {canChangePassword && (
              <TabsTrigger value="password" className="gap-0.5 text-xs sm:text-sm min-h-[36px]">
                <Lock className="size-3 shrink-0 opacity-80" aria-hidden />
                비밀번호
              </TabsTrigger>
            )}
          </TabsList>

          <TabsContent value="me" className="mt-4">
            <Card className="space-y-3 p-4">
              <div className="flex min-w-0 items-center gap-2 border-b border-border/40 pb-3">
                {isAdmin ? (
                  <UserRound className="size-6 shrink-0 text-chart-5" aria-hidden />
                ) : (
                  <span className="shrink-0">
                    <LevelIcon level={userLevel} size={24} />
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-lg font-bold text-foreground">{userName}</div>
                  {userEmail && <div className="truncate text-xs text-muted-foreground">{userEmail}</div>}
                  {isAdmin && (
                    <span className="mt-1 inline-block rounded-full border border-chart-5/30 bg-chart-5/20 px-2 py-0.5 text-xs font-bold text-chart-5">
                      운영자
                    </span>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={openEditDialog}
                  className="shrink-0 gap-1.5 text-xs"
                >
                  <Pencil className="size-3" aria-hidden />
                  내 정보 수정
                </Button>
              </div>

              {!isAdmin && (
                <div className="space-y-3 rounded-xl border border-border/40 bg-secondary/20 px-4 py-3">
                  {/* 레벨 헤더 */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <LevelIcon level={userLevel} size={22} />
                      <div className="min-w-0">
                        <span className={cn("block truncate text-sm font-bold text-foreground", levelLabelTrackingClassName)}>
                          {currentTier.label}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          📅 오늘 출석 보상 <strong className="text-chart-5">{currentDailyReward.toLocaleString()}P</strong>
                        </span>
                      </div>
                    </div>
                    {userLevel < 56 ? (
                      <button
                        type="button"
                        onClick={() => { setLevelUpOpen(true); setLevelUpMsg(null); }}
                        className="flex shrink-0 items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-bold transition-all"
                        style={{
                          background: canLevelUp
                            ? `color-mix(in oklch, var(--chart-5) 15%, transparent)`
                            : "var(--secondary)",
                          color: canLevelUp ? "var(--chart-5)" : "var(--muted-foreground)",
                          border: `1px solid ${canLevelUp ? "color-mix(in oklch, var(--chart-5) 35%, transparent)" : "var(--border)"}`,
                          opacity: canLevelUp ? 1 : 0.6,
                        }}
                      >
                        <ArrowUp className="size-3" aria-hidden />
                        레벨업
                      </button>
                    ) : (
                      <span className="shrink-0 text-xs font-bold text-chart-5">MAX ✨</span>
                    )}
                  </div>

                  {/* 진행도 프로그레스 바 */}
                  {nextTier && isFinite(levelUpCost) && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <span>다음:</span>
                          <LevelIcon level={userLevel + 1} size={12} />
                          <span className={cn(levelLabelTrackingClassName)}>{nextTier.label}</span>
                        </div>
                        <span className={canLevelUp ? "font-semibold text-green-400" : ""}>
                          {balance.toLocaleString()} / {levelUpCost.toLocaleString()} P
                        </span>
                      </div>
                      {/* 프로그레스 바 */}
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.round(levelProgress * 100)}%`,
                            background: canLevelUp
                              ? "var(--chart-5)"
                              : "color-mix(in oklch, var(--chart-5) 55%, var(--muted-foreground))",
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                        <span>레벨업 시 일일 보상 {nextDailyReward!.toLocaleString()}P</span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border/40 pt-3 text-xs text-muted-foreground">
                <span>
                  작성 글 <strong className="text-foreground">{myPosts.length}</strong>개
                </span>
                <span>
                  댓글 <strong className="text-foreground">{myComments.length}</strong>개
                </span>
                <span>
                  보유 페블 <strong className="text-chart-5">{balance.toLocaleString()}</strong> P
                </span>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="posts" className="mt-4">
            <div className="max-h-[60vh] space-y-2 overflow-auto pr-1">
              {postsLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : myPosts.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">아직 작성한 글이 없습니다.</p>
              ) : (
                myPosts.map((p) => (
                  <Link
                    key={p.id}
                    href={`/board/${p.id}`}
                    className="block rounded-lg border border-border/50 bg-card px-4 py-3 transition-colors hover:bg-secondary/30"
                  >
                    <div className="line-clamp-1 text-sm font-medium text-foreground">{p.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {new Date(p.createdAt).toLocaleString("ko-KR")}
                    </div>
                  </Link>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="comments" className="mt-4">
            <div className="max-h-[60vh] space-y-2 overflow-auto pr-1">
              {commentsLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : myComments.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">아직 작성한 댓글이 없습니다.</p>
              ) : (
                myComments.map((c) => (
                  <Link
                    key={c.id}
                    href={`/board/${c.postId}`}
                    className="block rounded-lg border border-border/50 bg-card px-4 py-3 transition-colors hover:bg-secondary/30"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="mb-0.5 line-clamp-1 text-xs text-muted-foreground">
                          {(c as { postTitle?: string }).postTitle ?? "게시글"}
                        </div>
                        <div className="line-clamp-2 text-sm text-foreground/90">{c.content}</div>
                      </div>
                      <MessageSquare className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {new Date(c.createdAt).toLocaleString("ko-KR")}
                    </div>
                  </Link>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="my-bets" className="mt-4">
            <MyCreatedBetsList
              active={tab === "my-bets"}
              userId={userId}
              variant="page"
              onMarketsLoaded={setMyBetsCount}
              onWaitingCount={setMyWaitingBetsCount}
            />
          </TabsContent>

          {canChangePassword && (
            <TabsContent value="password" className="mt-4">
              <Card className="space-y-3 border-border/60 p-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Lock className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  비밀번호 변경
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  이메일로 가입한 계정만 비밀번호를 바꿀 수 있습니다. 현재 비밀번호 확인 후 새 비밀번호를 입력해 주세요.
                </p>
                <form className="space-y-3" onSubmit={handlePasswordChange}>
                  <div className="space-y-1.5">
                    <Label htmlFor="profile-pwd-current">현재 비밀번호</Label>
                    <Input
                      id="profile-pwd-current"
                      type="password"
                      autoComplete="current-password"
                      value={pwdCurrent}
                      onChange={(e) => {
                        setPwdCurrent(e.target.value);
                        setPwdMsg(null);
                      }}
                      className="border-border/50 bg-secondary"
                      disabled={pwdBusy}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="profile-pwd-new">새 비밀번호</Label>
                    <Input
                      id="profile-pwd-new"
                      type="password"
                      autoComplete="new-password"
                      value={pwdNew}
                      onChange={(e) => {
                        setPwdNew(e.target.value);
                        setPwdMsg(null);
                      }}
                      className="border-border/50 bg-secondary"
                      disabled={pwdBusy}
                      placeholder="6자 이상"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="profile-pwd-confirm">새 비밀번호 확인</Label>
                    <Input
                      id="profile-pwd-confirm"
                      type="password"
                      autoComplete="new-password"
                      value={pwdConfirm}
                      onChange={(e) => {
                        setPwdConfirm(e.target.value);
                        setPwdMsg(null);
                      }}
                      className="border-border/50 bg-secondary"
                      disabled={pwdBusy}
                    />
                  </div>
                  {pwdMsg ? (
                    <p
                      className={
                        pwdMsg.type === "ok"
                          ? "text-sm text-green-600 dark:text-green-400"
                          : "text-sm text-destructive"
                      }
                      role={pwdMsg.type === "err" ? "alert" : undefined}
                    >
                      {pwdMsg.text}
                    </p>
                  ) : null}
                  <Button type="submit" size="sm" disabled={pwdBusy}>
                    {pwdBusy ? "처리 중…" : "비밀번호 변경"}
                  </Button>
                </form>
              </Card>
            </TabsContent>
          )}
        </Tabs>
      </main>

      {/* ─── 내 정보 수정 다이얼로그 ──────────────────────────────────── */}
      <Dialog open={editOpen} onOpenChange={(o) => { setEditOpen(o); }}>
        <DialogContent className="max-w-sm rounded-2xl border p-0 gap-0">
          <div className="h-1 w-full rounded-t-2xl bg-gradient-to-r from-chart-5/50 via-chart-5 to-chart-5/50" />
          <div className="p-6 space-y-5">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <Pencil className="size-4 text-chart-5" aria-hidden />
                내 정보 수정
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                닉네임을 변경할 수 있습니다.
              </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleNicknameChange} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="edit-nickname">새 닉네임</Label>
                <Input
                  id="edit-nickname"
                  type="text"
                  autoComplete="nickname"
                  value={editNickname}
                  onChange={(e) => { setEditNickname(e.target.value); setEditNickMsg(null); }}
                  className="border-border/50 bg-secondary"
                  disabled={editNickBusy}
                  placeholder="2~20자"
                  maxLength={20}
                />
                <p className="text-[11px] text-muted-foreground">
                  현재 닉네임: <span className="font-medium text-foreground">{userName}</span>
                </p>
              </div>

              {editNickMsg && (
                <div
                  className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${
                    editNickMsg.type === "ok"
                      ? "bg-green-500/10 text-green-500"
                      : "bg-destructive/10 text-destructive"
                  }`}
                  role={editNickMsg.type === "err" ? "alert" : undefined}
                >
                  {editNickMsg.type === "ok" ? (
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden />
                  ) : (
                    <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  )}
                  <span>{editNickMsg.text}</span>
                </div>
              )}

              <Button type="submit" disabled={editNickBusy} className="w-full">
                {editNickBusy ? (
                  <><Loader2 className="size-4 animate-spin mr-2" />확인 중…</>
                ) : "닉네임 저장"}
              </Button>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={levelUpOpen && !!nextTier} onOpenChange={(o) => { setLevelUpOpen(o); if (!o) setLevelUpMsg(null); }}>
        <DialogContent
          className="max-w-sm overflow-hidden rounded-2xl border p-0"
          style={{ borderColor: `color-mix(in oklch, var(--chart-5) 35%, transparent)` }}
        >
          <div className="h-1.5 w-full bg-gradient-to-r from-chart-5/60 via-chart-5 to-chart-5/60" />

          <div className="space-y-5 p-6">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <ArrowUp className="size-4 shrink-0 text-chart-5" aria-hidden />
                레벨업 확인
              </DialogTitle>
            </DialogHeader>

            {nextTier && (
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div className="rounded-xl border border-border/40 bg-secondary/30 px-3 py-3 text-center">
                  <p className="mb-1.5 text-[10px] text-muted-foreground">현재</p>
                  <LevelIcon level={userLevel} size={32} className="mx-auto mb-1" />
                  <p className={cn("text-xs font-semibold text-foreground", levelLabelTrackingClassName)}>
                    {currentTier.label}
                  </p>
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    📅 {currentDailyReward.toLocaleString()}P/일
                  </p>
                </div>

                <ArrowUp className="mx-auto size-5 text-chart-5" aria-hidden />

                <div
                  className="rounded-xl border px-3 py-3 text-center"
                  style={{
                    borderColor: `color-mix(in oklch, var(--chart-5) 35%, transparent)`,
                    background: `color-mix(in oklch, var(--chart-5) 6%, transparent)`,
                  }}
                >
                  <p className="mb-1.5 text-[10px] text-muted-foreground">레벨업 후</p>
                  <LevelIcon level={userLevel + 1} size={32} className="mx-auto mb-1" />
                  <p className={cn("text-xs font-semibold text-chart-5", levelLabelTrackingClassName)}>
                    {nextTier.label}
                  </p>
                  <p className="mt-1 text-[10px] font-semibold text-chart-5">
                    📅 {nextDailyReward?.toLocaleString()}P/일
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-2 rounded-xl border border-border/40 bg-secondary/20 px-4 py-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">레벨업 비용</span>
                <span className="font-bold text-foreground">{levelUpCost.toLocaleString()} P</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">현재 보유 페블</span>
                <span className={`font-bold ${canLevelUp ? "text-green-400" : "text-red-400"}`}>
                  {balance.toLocaleString()} P
                </span>
              </div>
              {nextDailyReward !== null && (
                <div className="flex items-center justify-between border-t border-border/30 pt-2 text-xs">
                  <span className="text-muted-foreground">레벨업 시 일일 보상</span>
                  <span className="font-semibold text-chart-5">
                    {nextDailyReward.toLocaleString()}P/일
                  </span>
                </div>
              )}
              {!canLevelUp && (
                <p className="border-t border-border/30 pt-2 text-[11px] text-red-400">
                  페블이 {(levelUpCost - balance).toLocaleString()} P 부족합니다
                </p>
              )}
            </div>

            {levelUpMsg && (
              <p className={cn(
                "text-center text-sm font-semibold",
                levelUpMsg.type === "ok" ? "text-green-400" : "text-destructive"
              )}>
                {levelUpMsg.text}
              </p>
            )}

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" type="button" onClick={() => setLevelUpOpen(false)} disabled={levelUpBusy}>
                취소
              </Button>
              <Button
                className="flex-1 gap-1.5"
                type="button"
                disabled={!canLevelUp || levelUpBusy}
                onClick={handleLevelUp}
                style={{
                  background: canLevelUp ? "var(--chart-5)" : undefined,
                  color: canLevelUp ? "white" : undefined,
                }}
              >
                {levelUpBusy ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="size-4" aria-hidden />
                )}
                {levelUpBusy ? "처리 중…" : "레벨업 확정"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
