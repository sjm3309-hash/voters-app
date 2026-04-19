"use client";

import { useEffect, useState, type ChangeEvent } from "react";
import Link from "next/link";
import { Plus, Search, Settings2, UserRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import { AuthButton } from "@/components/auth/auth-button";
import { NotificationsBell } from "@/components/notifications/notifications-bell";
import { PointsHistoryDialog } from "@/components/points/points-history-dialog";
import { useUserLevel } from "@/hooks/use-user-level";
import { Logo } from "@/components/common/Logo";
import { LevelIcon } from "@/components/level-icon";
import {
  cacheAuthorManualLevel,
  getUserManualLevel,
  setUserManualLevel,
} from "@/lib/level-system";
import { PurpleShieldIcon } from "@/components/admin-author-badge";
import { createClient } from "@/utils/supabase/client";

interface NavbarProps {
  balance: number;
  userId: string;
  /** 검색어 (홈 등). 넘기면 데스크톱·모바일 입력이 동일하게 표시됩니다. */
  searchQuery?: string;
  onSearch?: (query: string) => void;
}

export function Navbar({ balance, userId, searchQuery, onSearch }: NavbarProps) {
  const { mounted: levelMounted, loggedIn, isAdmin, nickname } = useUserLevel();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [userLevel, setUserLevel] = useState(() =>
    typeof window !== "undefined" && userId && userId !== "anon"
      ? getUserManualLevel(userId)
      : 1,
  );

  useEffect(() => {
    if (!userId || userId === "anon") {
      setUserLevel(1);
      return;
    }

    // 로컬 캐시로 먼저 표시(서버 응답 전 깜빡임 완화). DB와 다를 수 있음.
    setUserLevel(getUserManualLevel(userId));

    const onLevel = (e: Event) => {
      const ev = e as CustomEvent<{ level?: number }>;
      if (ev.detail?.level) setUserLevel(ev.detail.level);
      else setUserLevel(getUserManualLevel(userId));
    };
    window.addEventListener("voters:levelUpdated", onLevel);

    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/user/profile-level", {
          credentials: "same-origin",
          cache: "no-store",
        });
        const j = (await res.json().catch(() => ({}))) as { ok?: boolean; level?: number };
        if (cancelled || !res.ok || !j.ok || typeof j.level !== "number") return;

        setUserLevel(j.level);
        const local = getUserManualLevel(userId);
        if (local !== j.level) setUserManualLevel(userId, j.level);

        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        const displayName = (
          (typeof user?.user_metadata?.nickname === "string" && user.user_metadata.nickname) ||
          (typeof user?.user_metadata?.full_name === "string" && user.user_metadata.full_name) ||
          (typeof user?.user_metadata?.name === "string" && user.user_metadata.name) ||
          user?.email?.split("@")[0] ||
          ""
        ).trim();
        if (displayName) cacheAuthorManualLevel(displayName, j.level);
      } catch {
        /* 로컬 값 유지 */
      }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener("voters:levelUpdated", onLevel);
    };
  }, [userId]);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const mobileSearchInputDomId = "navbar-mobile-search-field";

  useEffect(() => {
    if (!mobileSearchOpen || !onSearch) return;
    const t = window.setTimeout(() => {
      document.getElementById(mobileSearchInputDomId)?.focus();
    }, 0);
    return () => window.clearTimeout(t);
  }, [mobileSearchOpen, onSearch]);

  /** 좁은 창에서 줄바꿈·압축만 막고, 너비는 라벨 길이대로(관리는 이전처럼 좁게) */
  const navCtaPillClass =
    "hidden sm:inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap px-3 py-1.5 rounded-full text-sm font-semibold border transition-all";

  return (
    <>
      <nav className="sticky top-0 z-50 flex items-center justify-between px-4 py-3 md:px-6 bg-background/80 backdrop-blur-xl border-b border-border">
        {/* 로고 */}
        <Logo href="/?tab=popular" className="-ml-2 md:text-4xl" />

        {/* lg 미만: 오른쪽 아이콘·pill이 많아 칸이 거의 없어지므로 시트 검색만 사용 */}
        <div className="hidden min-w-0 flex-1 max-w-md mx-2 sm:mx-4 lg:block">
          <div className="relative w-full min-w-[12rem]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder="보트/게시판을 검색해보세요..."
              className="w-full min-w-0 pl-10 bg-secondary border-border/50 focus:border-neon-blue/50 focus:ring-neon-blue/20 text-foreground placeholder:text-muted-foreground"
              {...(onSearch
                ? {
                    value: searchQuery ?? "",
                    onChange: (e: ChangeEvent<HTMLInputElement>) => onSearch(e.target.value),
                  }
                : {})}
            />
          </div>
        </div>

        <div className="flex items-center gap-1 sm:gap-2 md:gap-3">
          {onSearch ? (
            <>
              <button
                type="button"
                aria-label="검색 열기"
                className="lg:hidden p-2.5 rounded-lg hover:bg-secondary transition-colors"
                onClick={() => setMobileSearchOpen(true)}
              >
                <Search className="size-5 text-muted-foreground" />
              </button>
              <Sheet open={mobileSearchOpen} onOpenChange={setMobileSearchOpen}>
                <SheetContent
                  side="top"
                  className="gap-3 border-border pt-[max(1.5rem,env(safe-area-inset-top))] pb-4"
                >
                  <SheetHeader className="text-left space-y-1 pr-10">
                    <SheetTitle>보트 / 게시판 검색</SheetTitle>
                    <SheetDescription>
                      검색어를 입력하면 목록이 바로 필터됩니다.
                    </SheetDescription>
                  </SheetHeader>
                  <div className="relative px-1">
                    <Search className="absolute left-4 top-1/2 z-[1] -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
                    <Input
                      id={mobileSearchInputDomId}
                      type="text"
                      inputMode="search"
                      enterKeyHint="search"
                      placeholder="검색어를 입력하세요..."
                      value={searchQuery ?? ""}
                      onChange={(e) => onSearch(e.target.value)}
                      autoComplete="off"
                      autoCapitalize="none"
                      spellCheck={false}
                      className="relative z-[1] pl-10 pr-3 h-12 min-h-12 text-base leading-normal bg-secondary text-foreground border-border/50 placeholder:text-muted-foreground"
                    />
                  </div>
                </SheetContent>
              </Sheet>
            </>
          ) : null}

          {/* 관리 탭 — 운영자 전용 */}
          {levelMounted && loggedIn && isAdmin && (
            <Link
              href="/admin"
              className={navCtaPillClass}
              style={{
                background: "color-mix(in oklch, var(--chart-5) 8%, transparent)",
                borderColor: "color-mix(in oklch, var(--chart-5) 30%, transparent)",
                color: "var(--chart-5)",
              }}
            >
              <Settings2 className="size-3.5" />
              관리
            </Link>
          )}

          {/* 보트 생성하기 버튼 — 로그인 시에만 표시 */}
          {levelMounted && loggedIn && (
            <>
              {/* 데스크톱: 텍스트 pill */}
              <Link
                href="/market/create"
                className={navCtaPillClass}
                style={{
                  background: "color-mix(in oklch, var(--chart-5) 12%, transparent)",
                  borderColor: "color-mix(in oklch, var(--chart-5) 35%, transparent)",
                  color: "var(--chart-5)",
                }}
              >
                <Plus className="size-3.5" />
                보트 만들기
              </Link>
              {/* 모바일: 아이콘 전용 버튼 */}
              <Link
                href="/market/create"
                aria-label="보트 만들기"
                title="보트 만들기"
                className="sm:hidden flex items-center justify-center size-9 rounded-full border transition-colors"
                style={{
                  background: "color-mix(in oklch, var(--chart-5) 12%, transparent)",
                  borderColor: "color-mix(in oklch, var(--chart-5) 35%, transparent)",
                  color: "var(--chart-5)",
                }}
              >
                <Plus className="size-4" />
              </Link>
            </>
          )}

          {/* 닉네임 + 페블 통합 버튼 — 로그인 시에만 표시 */}
          {levelMounted && loggedIn && (
            <button
              onClick={() => setHistoryOpen(true)}
              className="flex shrink-0 items-center gap-1.5 px-2 py-1.5 sm:px-3 rounded-full bg-chart-5/10 border border-chart-5/30 hover:bg-chart-5/20 hover:border-chart-5/50 transition-colors whitespace-nowrap max-w-[200px] sm:max-w-[260px]"
              title="페블 내역 보기"
            >
              {/* 레벨 아이콘 — 운영자는 보라색 방패, 일반 유저는 레벨 아이콘 */}
              <span className="shrink-0">
                {isAdmin ? <PurpleShieldIcon size={14} /> : <LevelIcon level={userLevel} size={14} />}
              </span>
              {nickname && (
                <span className="hidden sm:block text-xs font-medium text-foreground truncate min-w-0 max-w-[80px]">
                  {nickname}
                </span>
              )}
              {nickname && (
                <span className="hidden sm:block text-xs text-muted-foreground shrink-0">·</span>
              )}
              <span className="text-chart-5 font-semibold text-sm shrink-0">
                <span suppressHydrationWarning>{balance.toLocaleString()}</span> P
              </span>
            </button>
          )}

          <ThemeToggle />
          {/* 프로필 — 알림 종과 동일한 히트 영역 */}
          {levelMounted && loggedIn && (
            <Link
              href="/profile"
              aria-label="프로필"
              title="프로필"
              className="relative flex shrink-0 items-center justify-center rounded-lg p-2 border border-border/60 bg-background text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <UserRound className="size-4" aria-hidden />
            </Link>
          )}
          {/* 알림 종 — 로그인 시에만 표시 */}
          {levelMounted && loggedIn && <NotificationsBell />}
          <AuthButton />
        </div>
      </nav>

      {/* 좁은 화면: 시트를 닫아도 현재 검색어가 보이도록 */}
      {onSearch && (searchQuery ?? "").length > 0 ? (
        <div className="lg:hidden flex items-center gap-2 border-b border-border/60 bg-muted/50 px-4 py-2 text-sm backdrop-blur-sm supports-[backdrop-filter]:bg-muted/40">
          <span className="shrink-0 text-muted-foreground">검색</span>
          <span className="min-w-0 flex-1 truncate font-medium text-foreground" title={searchQuery}>
            {searchQuery}
          </span>
          <button
            type="button"
            className="shrink-0 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
            onClick={() => onSearch("")}
          >
            지우기
          </button>
        </div>
      ) : null}

      {/* 페블 내역 모달 */}
      <PointsHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        userId={userId}
        currentPoints={balance}
      />
    </>
  );
}
