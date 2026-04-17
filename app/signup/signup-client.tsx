"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Loader2, Smartphone } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { grantWelcomeBonus } from "@/lib/points";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/common/Logo";

function toE164(phone: string): string {
  const d = phone.replace(/\D/g, "");
  if (d.startsWith("0")) return "+82" + d.slice(1);
  if (d.startsWith("82")) return "+" + d;
  return "+" + d;
}

function formatPhone(value: string): string {
  const d = value.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

function koreanError(msg: string): string {
  if (msg.includes("already been registered") || msg.includes("already registered") || msg.includes("already exists")) return "이미 사용 중인 이메일입니다.";
  if (msg.includes("duplicate") && msg.toLowerCase().includes("nickname")) return "이미 사용 중인 닉네임입니다.";
  if (msg.includes("Invalid OTP") || msg.includes("Token has expired") || msg.includes("invalid")) return "인증번호가 올바르지 않거나 만료되었습니다.";
  if (msg.includes("SMS") || msg.includes("phone provider") || msg.includes("not enabled")) return "SMS 인증 서비스가 설정되지 않았습니다. (Supabase Phone 설정 필요)";
  if (msg.includes("rate limit") || msg.includes("too many")) return "잠시 후 다시 시도해주세요.";
  return msg;
}

type Step = 1 | 2;

export function SignupClient() {
  const router = useRouter();

  const [step, setStep] = useState<Step>(1);

  // 폼 입력값 — 순서: 이메일 → 비번 → 확인 → 닉네임 → 휴대폰
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm]   = useState("");
  const [nickname, setNickname] = useState("");
  const [phone, setPhone]       = useState("");
  const [showPw, setShowPw]     = useState(false);

  // 필드 개별 에러
  const [emailError, setEmailError]       = useState("");
  const [nicknameError, setNicknameError] = useState("");

  // OTP
  const [otp, setOtp] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState("");
  const [success, setSuccess] = useState("");

  const supabase = createClient();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/");
    });
  }, []);

  // ── 이메일 포커스 아웃 시 간단 중복 체크 ─────────────────────
  // Supabase는 클라이언트에서 직접 중복 이메일 조회가 불가해
  // 실제 중복 여부는 2단계 가입 완료 시 서버 에러로 확인됩니다.
  // 닉네임 중복 체크도 동일 — profiles 테이블 연동 시 정확히 사전 확인 가능.

  // ── 1단계: 유효성 검사 + OTP 발송 ────────────────────────────
  async function handleSendOtp(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setSuccess("");
    setEmailError(""); setNicknameError("");

    // 클라이언트 유효성 검사
    if (password !== confirm)  { setError("비밀번호가 일치하지 않습니다."); return; }
    if (password.length < 8)   { setError("비밀번호는 8자 이상이어야 합니다."); return; }
    if (!nickname.trim())      { setNicknameError("닉네임을 입력해주세요."); return; }
    if (nickname.trim().length < 2) { setNicknameError("닉네임은 2자 이상이어야 합니다."); return; }
    const e164 = toE164(phone);
    if (e164.length < 12)      { setError("올바른 휴대폰 번호를 입력해주세요."); return; }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({ phone: e164 });
      if (error) throw error;
      setStep(2);
      setSuccess(`${phone}으로 인증번호를 발송했습니다.`);
    } catch (err: unknown) {
      setError(koreanError(err instanceof Error ? err.message : "오류가 발생했습니다."));
    } finally {
      setLoading(false);
    }
  }

  // ── 2단계: OTP 확인 → 이메일/닉네임/비번 연결 ───────────────
  async function handleVerify(e: React.FormEvent) {
    e.preventDefault();
    setError(""); setSuccess("");
    const e164 = toE164(phone);

    setLoading(true);
    try {
      // 1. 휴대폰 OTP 인증
      const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
        phone: e164,
        token: otp,
        type: "sms",
      });
      if (verifyError) throw verifyError;
      if (!verifyData.session) throw new Error("인증에 실패했습니다.");

      // 2. 이메일 + 비밀번호 + 닉네임 연결
      const { error: updateError } = await supabase.auth.updateUser({
        email,
        password,
        data: {
          full_name: nickname.trim(),
          nickname: nickname.trim(),
          phone_verified: true,
        },
      });
      if (updateError) throw updateError;

      // 가입 완료 → 환영 보너스 1000P 지급 (최초 1회)
      const uid = verifyData.session.user.id;
      grantWelcomeBonus(uid);

      window.location.href = "/";
    } catch (err: unknown) {
      const msg = koreanError(err instanceof Error ? err.message : "오류가 발생했습니다.");
      // 이메일 중복이면 1단계로 되돌려 이메일 필드에 표시
      if (msg.includes("이메일")) {
        setStep(1);
        setEmailError(msg);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background px-4 py-10">
      {/* 배경 장식 */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-60 -left-60 size-[600px] rounded-full bg-chart-5/8 blur-[120px]" />
        <div className="absolute -bottom-60 -right-60 size-[600px] rounded-full bg-neon-blue/8 blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 size-[400px] rounded-full bg-chart-5/5 blur-[80px]" />
      </div>

      <div className="relative w-full max-w-sm">
        {/* 로고 */}
        <div className="mb-8 flex w-full justify-center">
          <Logo href="/" className="text-4xl sm:text-5xl px-4 py-2" />
        </div>

        {/* 카드 */}
        <div className="rounded-2xl border border-border/60 bg-card/50 backdrop-blur-2xl shadow-2xl shadow-black/20 overflow-hidden">

          {/* 헤더 + 단계 표시 */}
          <div className="px-7 pt-6 pb-4 border-b border-border/40">
            <div className="flex items-center gap-3">
              <Link href="/login" className="text-muted-foreground hover:text-foreground transition-colors">
                <ArrowLeft className="size-4" />
              </Link>
              <h1 className="text-base font-bold text-foreground">회원가입</h1>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <StepDot step={1} current={step} label="정보 입력" />
              <div className={`flex-1 h-0.5 rounded transition-colors duration-300 ${step >= 2 ? "bg-chart-5" : "bg-border/40"}`} />
              <StepDot step={2} current={step} label="휴대폰 인증" />
              <div className="flex-1 h-0.5 rounded bg-border/40" />
              <div className="size-7 rounded-full flex items-center justify-center text-xs font-bold bg-border/20 text-muted-foreground/50">
                ✓
              </div>
            </div>
          </div>

          <div className="p-7 space-y-4">
            {/* 전체 에러 / 성공 */}
            {error && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-4 py-3 text-sm text-red-400">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-xl bg-green-500/10 border border-green-500/30 px-4 py-3 text-sm text-green-400">
                {success}
              </div>
            )}

            {/* ── 1단계 ── */}
            {step === 1 && (
              <form onSubmit={handleSendOtp} className="space-y-3">

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
                    <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
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

                {/* 구분선 */}
                <div className="flex items-center gap-2 py-1">
                  <div className="flex-1 h-px bg-border/40" />
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-chart-5 shrink-0">
                    <Smartphone className="size-3.5" /> 휴대폰 인증
                  </span>
                  <div className="flex-1 h-px bg-border/40" />
                </div>

                {/* 휴대폰 번호 */}
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">휴대폰 번호</label>
                  <Input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(formatPhone(e.target.value))}
                    placeholder="010-1234-5678"
                    required
                    autoComplete="tel"
                    className="bg-secondary/40 border-border/50 focus:border-chart-5/60 h-10 tracking-wider"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-chart-5/80 hover:bg-chart-5 text-white font-semibold py-2.5 text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading
                    ? <Loader2 className="size-4 animate-spin" />
                    : <><Smartphone className="size-4" /> 인증번호 받기</>
                  }
                </button>
              </form>
            )}

            {/* ── 2단계 ── */}
            {step === 2 && (
              <form onSubmit={handleVerify} className="space-y-4">
                <button
                  type="button"
                  onClick={() => { setStep(1); setOtp(""); setError(""); setSuccess(""); }}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="size-3.5" />
                  {phone} 번호 변경
                </button>

                <div className="space-y-2">
                  <label className="text-xs font-medium text-muted-foreground">문자로 받은 인증번호 6자리</label>
                  <Input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="000000"
                    required
                    autoComplete="one-time-code"
                    autoFocus
                    className="bg-secondary/40 border-border/50 focus:border-chart-5/60 h-14 text-center text-2xl tracking-[0.6em] font-mono"
                  />
                  <p className="text-xs text-muted-foreground/60 text-center">
                    인증번호는 발송 후 5분간 유효합니다.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={loading || otp.length < 6}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-chart-5/80 hover:bg-chart-5 text-white font-semibold py-2.5 text-sm transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading
                    ? <Loader2 className="size-4 animate-spin" />
                    : <><CheckCircle2 className="size-4" /> 인증 완료 · 가입하기</>
                  }
                </button>

                <button
                  type="button"
                  onClick={() => { setStep(1); setOtp(""); setError(""); setSuccess(""); }}
                  className="w-full text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
                >
                  인증번호 재발송
                </button>
              </form>
            )}
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

function StepDot({ step, current, label }: { step: number; current: number; label: string }) {
  const done   = current > step;
  const active = current === step;
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`size-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
        done   ? "bg-chart-5 text-white" :
        active ? "bg-chart-5/20 text-chart-5 ring-2 ring-chart-5" :
                 "bg-border/20 text-muted-foreground/50"
      }`}>
        {done ? "✓" : step}
      </div>
      <span className={`text-[10px] font-medium whitespace-nowrap transition-colors ${active ? "text-chart-5" : "text-muted-foreground/50"}`}>
        {label}
      </span>
    </div>
  );
}
