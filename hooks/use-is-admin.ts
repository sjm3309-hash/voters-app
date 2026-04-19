"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { isAdminEmail, isAdminUserId } from "@/lib/admin";

/**
 * 현재 로그인한 유저가 운영자인지 반환합니다.
 * 로딩 중에는 false를 반환합니다.
 */
export function useIsAdmin(): { isAdmin: boolean; loading: boolean } {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const user = data.user;
      setIsAdmin(isAdminEmail(user?.email) || isAdminUserId(user?.id));
      setLoading(false);
    });
  }, []);

  return { isAdmin, loading };
}
