"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Loader2, UserPlus } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/common/Logo";

const LOGIN_ERROR_MESSAGE = "이메일 또는 비밀번호가 올바르지 않습니다.";
const OAUTH_ERROR_MESSAGE = "소셜 로그인에 실패했습니다. 잠시 후 다시 시도해주세요.";

const supabase = createClient();

export function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loginLoading, setLoginLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const isOAuthError = Boolean(searchParams.get("error"));
  const oAuthErrorDetail = searchParams.get("error") ?? "";
  const [showError, setShowError] = useState(isOAuthError);
  const [errorMessage, setErrorMessage] = useState(
    isOAuthError ? `소셜 로그인 실패: ${oAuthErrorDetail}` : LOGIN_ERROR_MESSAGE,
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/");
    });
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setShowError(false);
    setLoginLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw error;
      window.location.href = "/";
    } catch {
      setErrorMessage(LOGIN_ERROR_MESSAGE);
      setShowError(true);
    } finally {
      setLoginLoading(false);
    }
  }

  async function handleGoogle() {
    setShowError(false);
    setGoogleLoading(true);
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${location.origin}/auth/callback` },
    });
    if (error) {
      setErrorMessage(OAUTH_ERROR_MESSAGE);
      setShowError(true);
      setGoogleLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-10">
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-60 -left-60 size-[600px] rounded-full bg-chart-5/8 blur-[120px]" />
        <div className="absolute -bottom-60 -right-60 size-[600px] rounded-full bg-neon-blue/8 blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-[400px] rounded-full bg-chart-5/5 blur-[80px]" />
      </div>

      <div className="relative w-full max-w-sm">
        <div className="mb-8 flex w-full justify-center">
          <Logo href="/" className="text-4xl sm:text-5xl px-4 py-2" />
        </div>

        <div className="rounded-2xl border border-border/60 bg-card/50 backdrop-blur-2xl shadow-2xl shadow-black/20 p-7 space-y-5">

          {/* 에러 메시지 */}
          {showError && (
            <div className="rounded-xl px-4 py-2 border border-red-500/35 bg-red-500/[0.08]" aria-live="polite">
              <p role="alert" className="text-center text-sm leading-snug text-red-500">
                {errorMessage}
              </p>
            </div>
          )}

          {/* 이메일/비번 폼 */}
          <form onSubmit={handleLogin} className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">이메일</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="example@email.com"
                required
                autoComplete="email"
                className="bg-secondary/40 border-border/50 focus:border-chart-5/60 h-10"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">비밀번호</label>
              <div className="relative">
                <Input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="비밀번호 입력"
                  required
                  autoComplete="current-password"
                  className="pr-10 bg-secondary/40 border-border/50 focus:border-chart-5/60 h-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            <button
              type="submit"
              disabled={loginLoading}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-chart-5/80 hover:bg-chart-5 text-white font-semibold py-2.5 text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loginLoading ? <Loader2 className="size-4 animate-spin" /> : "로그인"}
            </button>
          </form>

          {/* 구분선 */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border/40" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-card px-3 text-xs text-muted-foreground/60">또는</span>
            </div>
          </div>

          <div className="space-y-2.5">
            {/* 회원가입 */}
            <Link
              href="/signup"
              className="w-full flex items-center justify-center gap-2.5 rounded-xl border-2 border-chart-5/50 bg-chart-5/5 hover:bg-chart-5/10 hover:border-chart-5/70 px-5 py-2.5 text-sm font-bold text-chart-5 transition-all duration-200"
            >
              <UserPlus className="size-4" />
              회원가입하기
            </Link>

            {/* 구글 */}
            <button
              onClick={handleGoogle}
              disabled={googleLoading}
              className="w-full flex items-center justify-center gap-3 rounded-xl border border-border/70 bg-background/80 hover:bg-secondary/70 hover:border-border px-5 py-2.5 text-sm font-semibold text-foreground transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {googleLoading ? <Loader2 className="size-4 animate-spin" /> : <GoogleIcon />}
              구글로 시작하기
            </button>
          </div>
        </div>

        <p className="text-center text-xs text-muted-foreground/50 mt-5 leading-relaxed">
          계속 진행하면{" "}
          <span className="underline underline-offset-2 cursor-pointer hover:text-muted-foreground transition-colors">이용약관</span>
          {" "}및{" "}
          <span className="underline underline-offset-2 cursor-pointer hover:text-muted-foreground transition-colors">개인정보처리방침</span>
          에 동의하는 것으로 간주됩니다.
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden>
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18L12.048 13.56c-.806.54-1.836.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042L3.964 10.71Z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335"/>
    </svg>
  );
}
