"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { isAdminEmail, isAdminUserId } from "@/lib/admin";

export interface UserLevelInfo {
  isAdmin: boolean;
  level: number;
  label: string;   // "운영자" | "Lv.1" 등
  nickname: string;
  mounted: boolean;
  loggedIn: boolean;
}

function extractNickname(user: { user_metadata?: Record<string, unknown>; email?: string } | null): string {
  if (!user) return "";
  const m = user.user_metadata ?? {};
  const raw =
    (typeof m.nickname === "string" && m.nickname) ||
    (typeof m.full_name === "string" && m.full_name) ||
    (typeof m.name === "string" && m.name) ||
    user.email?.split("@")[0] ||
    "";
  return String(raw).trim();
}

export function useUserLevel(): UserLevelInfo {
  const [mounted,  setMounted]  = useState(false);
  const [isAdmin,  setIsAdmin]  = useState(false);
  const [loggedIn, setLoggedIn] = useState(false);
  const [nickname, setNickname] = useState("");

  const level = 1;

  useEffect(() => {
    setMounted(true);
    const supabase = createClient();

    supabase.auth.getSession().then(({ data: { session } }) => {
      const user = session?.user ?? null;
      setLoggedIn(!!user);
      setIsAdmin(isAdminEmail(user?.email) || isAdminUserId(user?.id));
      setNickname(extractNickname(user));
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null;
      setLoggedIn(!!user);
      setIsAdmin(isAdminEmail(user?.email) || isAdminUserId(user?.id));
      setNickname(extractNickname(user));
    });

    // 닉네임 변경 이벤트
    const onNicknameUpdated = () => {
      supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) setNickname(extractNickname(user));
      });
    };
    window.addEventListener("voters:nicknameUpdated", onNicknameUpdated);

    return () => {
      listener.subscription.unsubscribe();
      window.removeEventListener("voters:nicknameUpdated", onNicknameUpdated);
    };
  }, []);

  return {
    isAdmin,
    level,
    label: isAdmin ? "운영자" : `Lv.${level}`,
    nickname,
    mounted,
    loggedIn,
  };
}
