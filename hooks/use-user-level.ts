"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { isAdminEmail } from "@/lib/admin";

export interface UserLevelInfo {
  isAdmin: boolean;
  level: number;
  label: string;   // "운영자" | "Lv.1" 등
  mounted: boolean;
  loggedIn: boolean;
}

export function useUserLevel(): UserLevelInfo {
  const [mounted,  setMounted]  = useState(false);
  const [isAdmin,  setIsAdmin]  = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);

  // 나중에 포인트/활동 기반 레벨 계산으로 확장 가능
  const level = 1;

  useEffect(() => {
    setMounted(true);
    const supabase = createClient();

    // 초기 세션 읽기
    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user ?? null;
      setLoggedIn(!!user);
      setIsAdmin(isAdminEmail(user?.email));
    });

    // 로그인/로그아웃 이벤트 실시간 반영
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      setLoggedIn(!!user);
      setIsAdmin(isAdminEmail(user?.email));
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  return {
    isAdmin,
    level,
    label: isAdmin ? "운영자" : `Lv.${level}`,
    mounted,
    loggedIn,
  };
}
