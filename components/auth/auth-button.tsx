"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { LogIn, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";
import type { User } from "@supabase/supabase-js";

// 컴포넌트 밖에서 한 번만 생성 (싱글턴)
const supabase = createClient();

export function AuthButton() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => listener.subscription.unsubscribe();
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
    return (
      <Button variant="outline" size="sm" className="shrink-0 gap-1.5" onClick={handleLogout}>
        <LogOut className="size-4" />
        <span className="hidden sm:inline">로그아웃</span>
      </Button>
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
