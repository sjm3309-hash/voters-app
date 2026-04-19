"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Loader2, UserPlus } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/common/Logo";

function koreanError(msg: string): string {
  if (msg.includes("already been registered") || msg.includes("already registered") || msg.includes("already exists") || msg.includes("already registered")) return "이미 사용 중인 이메일입니다.";
  if (msg.includes("duplicate") && msg.toLowerCase().includes("nickname")) return "이미 사용 중인 닉네임입니다.";
  if (msg.includes("rate limit") || msg.includes("too many")) return "잠시 후 다시 시도해주세요.";
  if (msg.includes("Password should be")) return "비밀번호는 8자 이상이어야 합니다.";
  if (msg.includes("Unable to validate email")) return "유효하지 않은 이메일 주소입니다.";
  return msg;
}

const supabase = createClient();

export function SignupClient() {
  const router = useRouter();

  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [nickname, setNickname] = useState("");
  const [showPw, setShowPw]     = useState(false);

  const [emailError, setEmailError]       = useState("");
  const [nicknameError, setNicknameError] = useState("");

  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [done, setDone]         = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/");
    });
  }, []);

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setEmailError(""); setNicknameError("");

    if (password !== confirm)       { setError("비밀번호가 일치하지 않습니다."); return; }
    if (password.length < 8)        { setError("비밀번호는 8자 이상이어야 합니다."); return; }
    if (!nickname.trim())           { setNicknameError("닉네임을 입력해주세요."); return; }
    if (nickname.trim().length < 2) { setNicknameError("닉네임은 2자 이상이어야 합니다."); return; }

    setLoading(true);
    try {
      // 닉네임 중복 체크
      const checkRes = await fetch(
        `/api/user/check-nickname?nickname=${encodeURIComponent(nickname.trim())}`,
      );
      const checkJson = (await checkRes.json().catch(() => ({}))) as {
        ok?: boolean; available?: boolean; error?: string;
      };
      if (!checkJson.available) {
        setNicknameError(checkJson.error ?? "사용할 수 없는 닉네임입니다.");
        setLoading(false);
        return;
      }

      // 이메일+비밀번호+닉네임으로 가입 (이메일 중복은 Supabase가 자동 차단)
      const { error: signUpErr } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: nickname.trim(),
            nickname: nickname.trim(),
          },
        },
      });
      if (signUpErr) throw signUpErr;

      setDone(true);
    } catch (err: unknown) {
      const msg = koreanError(err instanceof Error ? err.message : "오류가 발생했습니다.");
      if (msg.includes("이메일")) setEmailError(msg);
      else setError(msg);
    } finally {
      setLoading(false);
    }
  }

  // ── 가입 완료 화면 ──────────────────────────────────────────────────────────
  if (done) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-10">
        <div className="pointer-events-none fixed inset-0 overflow-hidden">
          <div className="absolute -top-60 -left-60 size-[600px] rounded-full bg-chart-5/8 blur-[120px]" />
          <div className="absolute -bottom-60 -right-60 size-[600px] rounded-full bg-neon-blue/8 blur-[120px]" />
        </div>
        <div className="relative w-full max-w-sm">
          <div className="mb-8 flex w-full justify-center">
            <Logo href="/" className="text-4xl sm:text-5xl px-4 py-2" />
          </div>
          <div className="rounded-2xl border border-border/60 bg-card/50 backdrop-blur-2xl shadow-2xl shadow-black/20 p-8 text-center space-y-4">
            <div className="flex justify-center">
              <CheckCircle2 className="size-14 text-chart-5" />
            </div>
            <h2 className="text-lg font-bold text-foreground">가입 완료!</h2>
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{email}</span>로<br />
              인증 메일을 발송했습니다.<br />
              메일함을 확인 후 링크를 클릭하면 로그인할 수 있습니다.
            </p>
            <Link
              href="/login"
              className="block w-full rounded-xl bg-chart-5/80 hover:bg-chart-5 text-white font-semibold py-2.5 text-sm transition-all text-center"
            >
              로그인 페이지로
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // ── 가입 폼 ─────────────────────────────────────────────────────────────────
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

        <div className="rounded-2xl border border-border/60 bg-card/50 backdrop-blur-2xl shadow-2xl shadow-black/20 overflow-hidden">
          <div className="px-7 pt-6 pb-4 border-b border-border/40">
            <div className="flex items-center gap-3">
              <Link href="/login" className="text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="size-4" />
              </Link>
              <h1 className="text-base font-bold text-foreground">회원가입</h1>
            </div>
          </div>

          <div className="p-7 space-y-4">
            {error && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}

            <form onSubmit={handleSignup} className="space-y-3">
              {/* 이메일 */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">이메일</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setEmailError(""); }}
                  placeholder="example@email.com"
                  required
                  autoComplete="email"
                  className={`bg-secondary/40 border-border/50 focus:border-chart-5/60 h-10 ${emailError ? "border-red-500/60" : ""}`}
                />
                {emailError && <p className="text-xs text-red-400">{emailError}</p>}
              </div>

              {/* 비밀번호 */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">비밀번호</label>
                <div className="relative">
                  <Input
                    type={showPw ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="8자 이상"
                    required
                    autoComplete="new-password"
                    className="pr-10 bg-secondary/40 border-border/50 focus:border-chart-5/60 h-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              {/* 비밀번호 확인 */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">비밀번호 확인</label>
                <Input
                  type={showPw ? "text" : "password"}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="비밀번호 재입력"
                  required
                  className="bg-secondary/40 border-border/50 focus:border-chart-5/60 h-10"
                />
                {confirm && password !== confirm && (
                  <p className="text-xs text-red-400">비밀번호가 일치하지 않습니다.</p>
                )}
              </div>

              {/* 닉네임 */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">닉네임</label>
                <Input
                  value={nickname}
                  onChange={(e) => { setNickname(e.target.value); setNicknameError(""); }}
                  placeholder="2자 이상, 중복 불가"
                  required
                  className={`bg-secondary/40 border-border/50 focus:border-chart-5/60 h-10 ${nicknameError ? "border-red-500/60" : ""}`}
                />
                {nicknameError && <p className="text-xs text-red-400">{nicknameError}</p>}
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-chart-5/80 hover:bg-chart-5 text-white font-semibold py-2.5 text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed mt-2"
              >
                {loading
                  ? <Loader2 className="size-4 animate-spin" />
                  : <><UserPlus className="size-4" /> 가입하기</>
                }
              </button>
            </form>
          </div>
        </div>

        <p className="text-center text-sm text-muted-foreground mt-5">
          이미 계정이 있으신가요?{" "}
          <Link href="/login" className="font-semibold text-chart-5 hover:underline">
            로그인
          </Link>
        </p>
      </div>
    </div>
  );
}
