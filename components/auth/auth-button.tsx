"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogIn, LogOut, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";
import { isAdminEmail } from "@/lib/admin";
import { LevelIcon } from "@/components/level-icon";
import { getUserManualLevel } from "@/lib/level-system";
import type { User } from "@supabase/supabase-js";

// 컴포넌트 밖에서 한 번만 생성 (싱글턴)
const supabase = createClient();

export function AuthButton() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [mounted, setMounted] = useState(false);
  const [userLevel, setUserLevel] = useState<number>(1);

  useEffect(() => {
    setMounted(true);

    // 초기 세션 읽기 (네트워크 없이 로컬 캐시 사용)
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) setUserLevel(getUserManualLevel(u.id));
    });

    // 로그인/로그아웃 이벤트 실시간 반영
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) setUserLevel(getUserManualLevel(u.id));
    });

    // 레벨업 이벤트 감지
    const onLevelUp = (e: Event) => {
      const ev = e as CustomEvent<{ level: number }>;
      if (ev.detail) setUserLevel(ev.detail.level);
    };
    window.addEventListener("voters:levelUpdated", onLevelUp);

    // 닉네임 변경 이벤트 — 세션을 다시 읽어 표시명 즉시 갱신
    const onNicknameUpdated = () => {
      supabase.auth.getUser().then(({ data: { user: u } }) => {
        if (u) setUser({ ...u });
      });
    };
    window.addEventListener("voters:nicknameUpdated", onNicknameUpdated);

    return () => {
      listener.subscription.unsubscribe();
      window.removeEventListener("voters:levelUpdated", onLevelUp);
      window.removeEventListener("voters:nicknameUpdated", onNicknameUpdated);
    };
  }, []);

  async function handleLogout() {
    await supabase.auth.signOut();
    setUser(null);
    router.refresh();
  }

  if (!mounted) {
    return (
      <Link
        href="/login"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/60 bg-background text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
      >
        <LogIn className="size-4" />
        로그인
      </Link>
    );
  }

  if (user) {
    const displayName =
      user.user_metadata?.full_name ??
      user.user_metadata?.name ??
      user.email?.split("@")[0] ??
      "사용자";

    const admin = isAdminEmail(user.email);

    return (
      <div className="flex min-w-0 items-center gap-2">
        <div className="hidden sm:flex max-w-[13rem] shrink-0 items-center gap-2 px-3 py-1.5 rounded-full bg-secondary/60 border border-border/50">
          {admin ? (
            <Shield className="size-4 shrink-0 text-chart-5" />
          ) : (
            <span className="shrink-0">
              <LevelIcon level={userLevel} size={18} />
            </span>
          )}
          <span className="min-w-0 truncate text-sm font-medium text-foreground" title={displayName}>
            {displayName}
          </span>
          {admin && (
            <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-chart-5/20 text-chart-5 border border-chart-5/30 leading-none">
              운영자
            </span>
          )}
        </div>
        <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={handleLogout}>
          <LogOut className="size-4" />
          <span className="hidden sm:inline">로그아웃</span>
        </Button>
      </div>
    );
  }

  return (
    <Link
      href="/login"
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border/60 bg-background text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
    >
      <LogIn className="size-4" />
      로그인
    </Link>
  );
}
