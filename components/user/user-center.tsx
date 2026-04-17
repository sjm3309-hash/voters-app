"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUp,
  CheckCircle2,
  Lock,
  MessageSquare,
  UserRound,
} from "lucide-react";
import { LevelIcon, LevelProgress } from "@/components/level-icon";
import { useUserPointsBalance, spendUserPoints } from "@/lib/points";
import {
  getUserManualLevel,
  setUserManualLevel,
  getLevelUpCost,
  getTierByLevel,
  cacheAuthorManualLevel,
} from "@/lib/level-system";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { createClient } from "@/utils/supabase/client";
import { isAdminEmail } from "@/lib/admin";
import { loadBoardPosts, type BoardPost } from "@/lib/board";
import { loadComments, type Comment } from "@/lib/comments";

type UserCenterTab = "me" | "posts" | "comments";

export function UserCenter() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<UserCenterTab>("me");

  const [userName, setUserName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  /** 이메일·비밀번호 가입자만 비밀번호 변경 가능 (OAuth·휴대폰 전용은 제외) */
  const [canChangePassword, setCanChangePassword] = useState(false);
  const [mounted, setMounted] = useState(false);

  const [pwdCurrent, setPwdCurrent] = useState("");
  const [pwdNew, setPwdNew] = useState("");
  const [pwdConfirm, setPwdConfirm] = useState("");
  const [pwdBusy, setPwdBusy] = useState(false);
  const [pwdMsg, setPwdMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);

  useEffect(() => {
    setMounted(true);
    const supabase = createClient();

    // getUser: identities(이메일 가입 여부) 포함 — 비밀번호 변경 UI 분기용
    const loadUser = async () => {
      const { data: { user }, error } = await supabase.auth.getUser();
      if (error || !user) {
        setUserName("");
        setUserEmail("");
        setCanChangePassword(false);
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
    };

    void loadUser();
    setPosts(loadBoardPosts());
    setComments(loadComments());

    // 인증 상태 변경 즉시 반영
    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      void loadUser();
    });

    // 게시글/댓글 갱신 이벤트
    const onPostsUpdated  = () => setPosts(loadBoardPosts());
    const onCommentsUpdated = () => setComments(loadComments());
    const onStorage = () => {
      setPosts(loadBoardPosts());
      setComments(loadComments());
    };

    window.addEventListener("voters:postsUpdated",    onPostsUpdated    as EventListener);
    window.addEventListener("voters:commentsUpdated", onCommentsUpdated as EventListener);
    window.addEventListener("storage",                onStorage);

    return () => {
      authListener.subscription.unsubscribe();
      window.removeEventListener("voters:postsUpdated",    onPostsUpdated    as EventListener);
      window.removeEventListener("voters:commentsUpdated", onCommentsUpdated as EventListener);
      window.removeEventListener("storage",                onStorage);
    };
  }, []);

  const isAdmin = isAdminEmail(userEmail);
  const { userId: pointsUserId, points } = useUserPointsBalance();

  // ─── 레벨 상태 ──────────────────────────────────────────────────────────────
  const [userLevel, setUserLevel] = useState<number>(1);
  const [levelUpOpen, setLevelUpOpen] = useState(false);

  useEffect(() => {
    if (pointsUserId && pointsUserId !== "anon") {
      setUserLevel(getUserManualLevel(pointsUserId));
    }
    const onLevelUp = (e: Event) => {
      const ev = e as CustomEvent<{ level: number }>;
      if (ev.detail) setUserLevel(ev.detail.level);
    };
    window.addEventListener("voters:levelUpdated", onLevelUp);
    return () => window.removeEventListener("voters:levelUpdated", onLevelUp);
  }, [pointsUserId]);

  const levelUpCost = getLevelUpCost(userLevel);
  const canLevelUp = userLevel < 56 && points >= levelUpCost;
  const currentTier = getTierByLevel(userLevel);
  const nextTier = userLevel < 56 ? getTierByLevel(userLevel + 1) : null;

  const handleLevelUp = () => {
    if (!canLevelUp || !pointsUserId || pointsUserId === "anon") return;
    const result = spendUserPoints(pointsUserId, levelUpCost, `⬆️ 레벨업 (Lv.${userLevel} → Lv.${userLevel + 1})`);
    if (!result.ok) return;
    const newLevel = userLevel + 1;
    setUserManualLevel(pointsUserId, newLevel);
    // 작성자 수동 레벨 캐시 갱신 (게시글/댓글 아이콘 즉시 반영)
    if (userName) cacheAuthorManualLevel(userName, newLevel);
    setLevelUpOpen(false);
  };

  const myPosts = useMemo(() => {
    if (!userName) return [];
    return posts
      .filter((p) => p.author === userName)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [posts, userName]);

  const postTitleById = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of posts) map.set(p.id, p.title);
    return map;
  }, [posts]);

  const myComments = useMemo(() => {
    if (!userName) return [];
    return comments
      .filter((c) => c.author === userName)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [comments, userName]);

  useEffect(() => {
    if (!open) {
      setPwdCurrent("");
      setPwdNew("");
      setPwdConfirm("");
      setPwdMsg(null);
    }
  }, [open]);

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

  // SSR 방지 + 미로그인 시 숨김
  if (!mounted || !userName) return null;

  const openTab = (next: UserCenterTab) => { setTab(next); setOpen(true); };

  return (
    <>
      <div className="hidden shrink-0 sm:flex items-center gap-2">
        {/* 내 정보 버튼만 표시 — 내 글/댓글은 모달 안에서 확인 */}
        <button
          type="button"
          className="shrink-0 whitespace-nowrap px-3 py-1.5 text-xs font-medium rounded-lg border border-border/50 bg-secondary/30 hover:bg-secondary transition-colors"
          onClick={() => openTab("me")}
        >
          내 정보
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex min-w-0 items-center gap-2 pr-8">
              {isAdmin ? (
                <UserRound className="size-4 shrink-0 text-chart-5" />
              ) : (
                <span className="shrink-0">
                  <LevelIcon level={userLevel} size={20} />
                </span>
              )}
              <span className="min-w-0 truncate font-semibold" title={userName}>
                {userName}
              </span>
              {isAdmin && (
                <span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-full bg-chart-5/20 text-chart-5 border border-chart-5/30">
                  운영자
                </span>
              )}
            </DialogTitle>
          </DialogHeader>

          <Tabs value={tab} onValueChange={(v) => setTab(v as UserCenterTab)}>
            <TabsList className="!grid h-auto min-h-9 w-full grid-cols-3 gap-1 rounded-lg bg-muted p-[3px] text-muted-foreground">
              <TabsTrigger value="me" className="!flex-none w-full min-w-0 justify-center px-1.5 sm:px-2">
                내 정보
              </TabsTrigger>
              <TabsTrigger value="posts" className="!flex-none w-full min-w-0 justify-center px-1.5 sm:px-2">
                내 글 ({myPosts.length})
              </TabsTrigger>
              <TabsTrigger value="comments" className="!flex-none w-full min-w-0 justify-center px-1.5 sm:px-2">
                내 댓글 ({myComments.length})
              </TabsTrigger>
            </TabsList>

            {/* 내 정보 */}
            <TabsContent value="me">
              <div className="space-y-3 py-2">
                <Card className="p-4 space-y-3">
                  {/* 프로필 헤더 */}
                  <div className="space-y-0.5">
                    <div className="text-lg font-bold text-foreground">{userName}</div>
                    {userEmail && (
                      <div className="text-xs text-muted-foreground">{userEmail}</div>
                    )}
                    {isAdmin && (
                      <span className="text-xs font-bold px-2 py-0.5 mt-1 inline-block rounded-full bg-chart-5/20 text-chart-5 border border-chart-5/30">
                        운영자
                      </span>
                    )}
                  </div>

                  {/* 레벨 + 레벨업 (운영자 제외) */}
                  {!isAdmin && (
                    <div className="rounded-xl border border-border/40 bg-secondary/20 px-4 py-3 space-y-2">
                      {/* 현재 레벨 */}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <LevelIcon level={userLevel} size={22} />
                          <div>
                            <span className="text-sm font-bold text-foreground">{currentTier.label}</span>
                            <span className="text-xs text-muted-foreground ml-1.5">(Lv.{userLevel})</span>
                          </div>
                        </div>
                        {userLevel < 56 ? (
                          <button
                            onClick={() => setLevelUpOpen(true)}
                            className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold transition-all"
                            style={{
                              background: canLevelUp
                                ? `color-mix(in oklch, var(--chart-5) 15%, transparent)`
                                : "var(--secondary)",
                              color: canLevelUp ? "var(--chart-5)" : "var(--muted-foreground)",
                              border: `1px solid ${canLevelUp ? "color-mix(in oklch, var(--chart-5) 35%, transparent)" : "var(--border)"}`,
                              opacity: canLevelUp ? 1 : 0.6,
                            }}
                          >
                            <ArrowUp className="size-3" />
                            레벨업
                          </button>
                        ) : (
                          <span className="text-xs font-bold text-chart-5 px-2">MAX ✨</span>
                        )}
                      </div>

                      {/* 다음 레벨 미리보기 */}
                      {nextTier && (
                        <div className="flex items-center justify-between text-xs text-muted-foreground border-t border-border/30 pt-2">
                          <div className="flex items-center gap-1.5">
                            <span>다음:</span>
                            <LevelIcon level={userLevel + 1} size={14} />
                            <span>{nextTier.label} (Lv.{userLevel + 1})</span>
                          </div>
                          <span className={canLevelUp ? "text-green-400 font-semibold" : "text-muted-foreground"}>
                            {levelUpCost.toLocaleString()} P 필요
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* 활동 요약 */}
                  <div className="flex gap-4 pt-1 text-xs text-muted-foreground border-t border-border/40">
                    <span>작성 글 <strong className="text-foreground">{myPosts.length}</strong>개</span>
                    <span>댓글 <strong className="text-foreground">{myComments.length}</strong>개</span>
                    <span>보유 페블 <strong className="text-chart-5">{points.toLocaleString()}</strong> P</span>
                  </div>
                </Card>

                {canChangePassword && (
                  <Card className="p-4 space-y-3 border-border/60">
                    <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                      <Lock className="size-4 shrink-0 text-muted-foreground" />
                      비밀번호 변경
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      이메일로 가입한 계정만 여기서 비밀번호를 바꿀 수 있습니다. 현재 비밀번호 확인 후 새 비밀번호를 입력해 주세요.
                    </p>
                    <form className="space-y-3" onSubmit={handlePasswordChange}>
                      <div className="space-y-1.5">
                        <Label htmlFor="pwd-current">현재 비밀번호</Label>
                        <Input
                          id="pwd-current"
                          type="password"
                          autoComplete="current-password"
                          value={pwdCurrent}
                          onChange={(e) => {
                            setPwdCurrent(e.target.value);
                            setPwdMsg(null);
                          }}
                          className="bg-secondary border-border/50"
                          disabled={pwdBusy}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="pwd-new">새 비밀번호</Label>
                        <Input
                          id="pwd-new"
                          type="password"
                          autoComplete="new-password"
                          value={pwdNew}
                          onChange={(e) => {
                            setPwdNew(e.target.value);
                            setPwdMsg(null);
                          }}
                          className="bg-secondary border-border/50"
                          disabled={pwdBusy}
                          placeholder="6자 이상"
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="pwd-confirm">새 비밀번호 확인</Label>
                        <Input
                          id="pwd-confirm"
                          type="password"
                          autoComplete="new-password"
                          value={pwdConfirm}
                          onChange={(e) => {
                            setPwdConfirm(e.target.value);
                            setPwdMsg(null);
                          }}
                          className="bg-secondary border-border/50"
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
                      <Button type="submit" size="sm" disabled={pwdBusy} className="w-full sm:w-auto">
                        {pwdBusy ? "처리 중…" : "비밀번호 변경"}
                      </Button>
                    </form>
                  </Card>
                )}
              </div>
            </TabsContent>

            {/* 내 글 */}
            <TabsContent value="posts">
              <div className="space-y-2 max-h-[55vh] overflow-auto pr-1 py-2">
                {myPosts.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-10 text-center">
                    아직 작성한 글이 없습니다.
                  </div>
                ) : (
                  myPosts.map((p) => (
                    <Link
                      key={p.id}
                      href={`/board/${p.id}`}
                      className="block rounded-lg border border-border/50 bg-card px-4 py-3 hover:bg-secondary/30 transition-colors"
                      onClick={() => setOpen(false)}
                    >
                      <div className="text-sm font-medium text-foreground line-clamp-1">
                        {p.title}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {new Date(p.createdAt).toLocaleString("ko-KR")}
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </TabsContent>

            {/* 내 댓글 */}
            <TabsContent value="comments">
              <div className="space-y-2 max-h-[55vh] overflow-auto pr-1 py-2">
                {myComments.length === 0 ? (
                  <div className="text-sm text-muted-foreground py-10 text-center">
                    아직 작성한 댓글이 없습니다.
                  </div>
                ) : (
                  myComments.map((c) => (
                    <Link
                      key={c.id}
                      href={`/board/${c.postId}`}
                      className="block rounded-lg border border-border/50 bg-card px-4 py-3 hover:bg-secondary/30 transition-colors"
                      onClick={() => setOpen(false)}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-xs text-muted-foreground mb-0.5 line-clamp-1">
                            {postTitleById.get(c.postId) ?? "게시글"}
                          </div>
                          <div className="text-sm text-foreground/90 line-clamp-2">
                            {c.content}
                          </div>
                        </div>
                        <MessageSquare className="size-4 text-muted-foreground shrink-0" />
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {new Date(c.createdAt).toLocaleString("ko-KR")}
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>

          <div className="flex justify-end pt-1">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              닫기
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ─── 레벨업 확인 다이얼로그 ─────────────────────────────────────────── */}
      <Dialog open={levelUpOpen && !!nextTier} onOpenChange={setLevelUpOpen}>
        <DialogContent className="max-w-sm p-0 overflow-hidden rounded-2xl border"
          style={{ borderColor: `color-mix(in oklch, var(--chart-5) 35%, transparent)` }}
        >
          {/* 상단 색상 띠 */}
          <div className="h-1.5 w-full bg-gradient-to-r from-chart-5/60 via-chart-5 to-chart-5/60" />

          <div className="p-6 space-y-5">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="size-4 text-amber-400 shrink-0" />
                레벨을 올리시겠습니까?
              </DialogTitle>
            </DialogHeader>

            {/* 현재 → 다음 레벨 */}
            {nextTier && (
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                {/* 현재 레벨 */}
                <div className="rounded-xl border border-border/40 bg-secondary/30 px-3 py-3 text-center">
                  <p className="text-[10px] text-muted-foreground mb-1.5">현재 레벨</p>
                  <LevelIcon level={userLevel} size={32} className="mx-auto mb-1" />
                  <p className="text-xs font-semibold text-foreground">{currentTier.label}</p>
                  <p className="text-[10px] text-muted-foreground">Lv.{userLevel}</p>
                </div>

                {/* 화살표 */}
                <ArrowUp className="size-5 text-chart-5 mx-auto" />

                {/* 다음 레벨 */}
                <div
                  className="rounded-xl border px-3 py-3 text-center"
                  style={{
                    borderColor: `color-mix(in oklch, var(--chart-5) 35%, transparent)`,
                    background: `color-mix(in oklch, var(--chart-5) 6%, transparent)`,
                  }}
                >
                  <p className="text-[10px] text-muted-foreground mb-1.5">다음 레벨</p>
                  <LevelIcon level={userLevel + 1} size={32} className="mx-auto mb-1" />
                  <p className="text-xs font-semibold text-chart-5">{nextTier.label}</p>
                  <p className="text-[10px] text-muted-foreground">Lv.{userLevel + 1}</p>
                </div>
              </div>
            )}

            {/* 비용 정보 */}
            <div className="rounded-xl border border-border/40 bg-secondary/20 px-4 py-3 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">레벨업 비용</span>
                <span className="font-bold text-foreground">{levelUpCost.toLocaleString()} P</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">현재 보유 페블</span>
                <span className={`font-bold ${canLevelUp ? "text-green-400" : "text-red-400"}`}>
                  {points.toLocaleString()} P
                </span>
              </div>
              {!canLevelUp && (
                <p className="text-[11px] text-red-400 border-t border-border/30 pt-2">
                  페블이 {(levelUpCost - points).toLocaleString()} P 부족합니다
                </p>
              )}
            </div>

            {/* 버튼 */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setLevelUpOpen(false)}
              >
                취소
              </Button>
              <Button
                className="flex-1 gap-1.5"
                disabled={!canLevelUp}
                onClick={handleLevelUp}
                style={{
                  background: canLevelUp ? "var(--chart-5)" : undefined,
                  color: canLevelUp ? "white" : undefined,
                }}
              >
                <CheckCircle2 className="size-4" />
                레벨업 확정
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
