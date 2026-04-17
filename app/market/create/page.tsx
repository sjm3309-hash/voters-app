"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, AlertTriangle, ArrowLeft, Check, CheckCircle2, Clock, Coins, Plus, ShieldAlert, TrendingUp, Trash2, X } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  MARKET_CATEGORIES,
  OPTION_COLORS,
  generateMarketId,
  saveUserMarket,
  type UserMarket,
} from "@/lib/markets";
import { createClient } from "@/utils/supabase/client";
import { spendUserPoints, isAdminUser, useUserPointsBalance } from "@/lib/points";
import { CREATOR_FEE_RATE } from "@/lib/market-settlement";

const CREATE_COST = 10_000; // 보트 만들기 비용 (페블)

const MAX_OPTIONS = 5;
const MIN_OPTIONS = 2;

// ─── 선택 가능한 색상 팔레트 ──────────────────────────────────────────────────
const COLOR_PALETTE = [
  { id: "blue",    label: "파랑",  value: "oklch(0.7 0.18 230)" },
  { id: "green",   label: "초록",  value: "oklch(0.7 0.18 150)" },
  { id: "red",     label: "빨강",  value: "oklch(0.65 0.22 25)"  },
  { id: "yellow",  label: "노랑",  value: "oklch(0.75 0.15 80)"  },
  { id: "purple",  label: "보라",  value: "oklch(0.65 0.2 300)"  },
  { id: "orange",  label: "주황",  value: "oklch(0.72 0.19 55)"  },
  { id: "pink",    label: "분홍",  value: "oklch(0.72 0.18 350)" },
  { id: "cyan",    label: "하늘",  value: "oklch(0.75 0.13 200)" },
  { id: "lime",    label: "연두",  value: "oklch(0.78 0.17 130)" },
  { id: "indigo",  label: "남색",  value: "oklch(0.6 0.2 265)"   },
  { id: "rose",    label: "장미",  value: "oklch(0.65 0.22 10)"  },
  { id: "teal",    label: "청록",  value: "oklch(0.68 0.14 185)" },
] as const;

// ─── 옵션 타입 ────────────────────────────────────────────────────────────────
interface OptionItem {
  label: string;
  color: string;
}

// ─── 색상 팝오버 컴포넌트 ────────────────────────────────────────────────────
function ColorPicker({
  value,
  onChange,
  usedColors,
}: {
  value: string;
  onChange: (color: string) => void;
  usedColors: string[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      {/* 색상 버튼 */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="size-7 rounded-full border-2 border-white/20 shadow-sm hover:scale-110 transition-transform ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        style={{ background: value }}
        title="색상 변경"
      />

      {/* 팝오버 */}
      {open && (
        <div className="absolute left-0 top-9 z-50 p-3 rounded-xl border border-border/60 bg-popover shadow-xl w-[188px]">
          <p className="text-[11px] text-muted-foreground mb-2 font-medium">색상 선택</p>
          <div className="grid grid-cols-6 gap-1.5">
            {COLOR_PALETTE.map((c) => {
              const isSelected = c.value === value;
              const isUsed = !isSelected && usedColors.includes(c.value);
              return (
                <button
                  key={c.id}
                  type="button"
                  title={c.label}
                  onClick={() => { onChange(c.value); setOpen(false); }}
                  disabled={isUsed}
                  className={cn(
                    "size-7 rounded-full flex items-center justify-center transition-transform",
                    isUsed ? "opacity-25 cursor-not-allowed" : "hover:scale-110",
                    isSelected && "ring-2 ring-white ring-offset-1 ring-offset-popover"
                  )}
                  style={{ background: c.value }}
                >
                  {isSelected && <Check className="size-3 text-white drop-shadow" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── KST 날짜+시간 → UTC ISO 변환 ────────────────────────────────────────────
function kstToUtcISO(date: string, time: string): string {
  return new Date(`${date}T${time}:00+09:00`).toISOString();
}

function nowKSTString(): string {
  const kstMs = Date.now() + 9 * 60 * 60 * 1000;
  return new Date(kstMs).toISOString().slice(0, 16);
}

function tomorrowKSTString(): { date: string; time: string } {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const kstMs = d.getTime() + 9 * 60 * 60 * 1000;
  const iso = new Date(kstMs).toISOString();
  return { date: iso.slice(0, 10), time: "23:59" };
}

// ─── 보트 생성 확인 다이얼로그 ───────────────────────────────────────────────
interface CreateConfirmDialogProps {
  question: string;
  balance: number;
  isAdmin?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  submitting: boolean;
}

function CreateConfirmDialog({ question, balance, isAdmin, onConfirm, onCancel, submitting }: CreateConfirmDialogProps) {
  const affordable = isAdmin || balance >= CREATE_COST;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      {/* 오버레이 */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* 다이얼로그 카드 */}
      <div
        className="relative w-full max-w-sm rounded-2xl border border-border/60 bg-card shadow-2xl overflow-hidden"
        style={{ boxShadow: "0 0 40px color-mix(in oklch, var(--chart-5) 15%, transparent)" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 상단 색상 띠 */}
        <div className="h-1.5 w-full bg-chart-5" />

        <div className="p-6 space-y-5">
          {/* 닫기 */}
          <button
            onClick={onCancel}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
          >
            <X className="size-4" />
          </button>

          {/* 헤더 */}
          <div className="pr-6">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">보트 만들기 확인</p>
            <p className="text-sm font-medium text-foreground line-clamp-2 leading-snug">{question}</p>
          </div>

          {/* 비용 안내 */}
          <div className="rounded-xl border border-border/40 bg-secondary/20 p-4 space-y-3">
            {/* 생성 비용 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Coins className="size-4 text-amber-400" />
                <span>보트 생성 비용</span>
              </div>
              {isAdmin ? (
                <span className="text-sm font-bold text-chart-5">운영자 무료</span>
              ) : (
                <span className="text-sm font-bold text-red-400">−{CREATE_COST.toLocaleString()} P</span>
              )}
            </div>

            {/* 보유 페블 */}
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">현재 보유 페블</span>
              <span className={cn("text-xs font-semibold", affordable ? "text-foreground" : "text-red-400")}>
                {balance.toLocaleString()} P
              </span>
            </div>

            {/* 생성 후 잔액 */}
            {!isAdmin && (
              <div className="flex items-center justify-between pt-2 border-t border-border/30">
                <span className="text-xs text-muted-foreground">생성 후 잔액</span>
                <span className={cn("text-sm font-bold", affordable ? "text-foreground" : "text-red-400")}>
                  {affordable ? (balance - CREATE_COST).toLocaleString() : "페블 부족"} P
                </span>
              </div>
            )}
          </div>

          {/* 창작자 수익 안내 */}
          <div className="rounded-xl border border-chart-5/30 bg-chart-5/5 px-4 py-3 space-y-2">
            <div className="flex items-center gap-2">
              <TrendingUp className="size-4 text-chart-5" />
              <p className="text-xs font-semibold text-chart-5">창작자 수익 안내</p>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              보트가 종료되고 결과가 입력되면, 전체 베팅 페블의{" "}
              <span className="font-bold text-chart-5">{(CREATOR_FEE_RATE * 100).toFixed(0)}%</span>
              를 창작자 수수료로 수령할 수 있습니다.
            </p>
            <p className="text-[11px] text-muted-foreground">
              예) 총 베팅 10,000 P → 창작자 수령 500 P
            </p>
          </div>

          {!affordable && (
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs">
              <AlertCircle className="size-3.5 shrink-0" />
              페블이 부족합니다. {(CREATE_COST - balance).toLocaleString()} P가 더 필요합니다.
            </div>
          )}

          {/* 수정 불가 경고 */}
          <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-500/8 border border-amber-500/25 text-amber-400 text-xs">
            <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
            <span>확정 후에는 보트 내용을 수정할 수 없습니다. 질문, 선택지, 마감일 등을 다시 한번 확인해주세요.</span>
          </div>

          {/* 버튼 */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={onCancel}
              className="flex-1 py-2.5 rounded-xl border border-border/50 bg-secondary/50 hover:bg-secondary text-sm font-semibold text-muted-foreground transition-colors"
            >
              취소
            </button>
            <button
              onClick={onConfirm}
              disabled={!affordable || submitting}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                background: "var(--chart-5)",
                color: "white",
                boxShadow: affordable ? "0 4px 16px color-mix(in oklch, var(--chart-5) 30%, transparent)" : undefined,
              }}
            >
              <CheckCircle2 className="size-4" />
              {submitting ? "생성 중…" : "확인 · 보트 만들기"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 메인 페이지 ─────────────────────────────────────────────────────────────
function CreateMarketPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { userId, points: balance } = useUserPointsBalance();

  const initialCategory = (() => {
    const c = searchParams.get("category");
    return MARKET_CATEGORIES.some((m) => m.id === c) ? c! : "fun";
  })();

  const [question, setQuestion]     = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory]     = useState(initialCategory);
  const [resolver, setResolver]     = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState("");
  const [showConfirm, setShowConfirm] = useState(false);

  // 체크리스트
  const [checks, setChecks] = useState({
    noMisfortuneOrCrime: false,
    confirmWithin10Hours: false,
  });
  const allChecked = Object.values(checks).every(Boolean);
  const toggleCheck = (key: keyof typeof checks) =>
    setChecks((prev) => ({ ...prev, [key]: !prev[key] }));

  // 선택지 (label + color)
  const [options, setOptions] = useState<OptionItem[]>([
    { label: "", color: "oklch(0.65 0.22 25)"  }, // 빨강
    { label: "", color: "oklch(0.7 0.18 230)"  }, // 파랑
  ]);

  // 마감 날짜/시간 (KST)
  const tomorrow = tomorrowKSTString();
  const [endsDate, setEndsDate] = useState(tomorrow.date);
  const [endsTime, setEndsTime] = useState(tomorrow.time);

  // 결과 발표 날짜/시간 (KST)
  const [resultDate, setResultDate] = useState("");
  const [resultTime, setResultTime] = useState("12:00");

  // ── 옵션 수정 ─────────────────────────────────────────────────────────────
  const updateLabel = (idx: number, label: string) =>
    setOptions((prev) => prev.map((o, i) => (i === idx ? { ...o, label } : o)));

  const updateColor = (idx: number, color: string) =>
    setOptions((prev) => prev.map((o, i) => (i === idx ? { ...o, color } : o)));

  const addOption = () => {
    if (options.length >= MAX_OPTIONS) return;
    // 아직 사용되지 않은 첫 번째 색상을 기본으로
    const used = options.map((o) => o.color);
    const next = COLOR_PALETTE.find((c) => !used.includes(c.value))?.value
      ?? OPTION_COLORS[options.length % OPTION_COLORS.length];
    setOptions((prev) => [...prev, { label: "", color: next }]);
  };

  const removeOption = (idx: number) => {
    if (options.length <= MIN_OPTIONS) return;
    setOptions((prev) => prev.filter((_, i) => i !== idx));
  };

  // ── 유효성 검사 ───────────────────────────────────────────────────────────
  const validate = (): string => {
    if (!question.trim()) return "보트 질문을 입력해주세요.";
    if (question.trim().length < 5) return "질문은 5자 이상 입력해주세요.";
    const filled = options.filter((o) => o.label.trim());
    if (filled.length < MIN_OPTIONS) return `선택지를 최소 ${MIN_OPTIONS}개 입력해주세요.`;
    const labels = filled.map((o) => o.label.trim());
    if (new Set(labels).size !== labels.length) return "선택지에 중복된 항목이 있습니다.";
    const colors = filled.map((o) => o.color);
    if (new Set(colors).size !== colors.length) return "선택지 색상이 중복됩니다. 각 선택지마다 다른 색을 사용해주세요.";
    if (!endsDate || !endsTime) return "마감 날짜와 시간을 선택해주세요.";
    if (new Date(kstToUtcISO(endsDate, endsTime)) <= new Date())
      return "마감 일시는 현재 시각 이후여야 합니다.";
    if (!resultDate || !resultTime) return "결과 발표 날짜와 시간을 선택해주세요.";
    if (new Date(kstToUtcISO(resultDate, resultTime)) <= new Date(kstToUtcISO(endsDate, endsTime)))
      return "결과 발표 일시는 마감 일시 이후여야 합니다.";
    return "";
  };

  // ── 1단계: 유효성 검사 후 확인 다이얼로그 표시 ──────────────────────────
  const handleSubmit = () => {
    const err = validate();
    if (err) { setError(err); return; }
    setError("");
    setShowConfirm(true);
  };

  // ── 2단계: 다이얼로그에서 확정 → 페블 차감 + 보트 저장 ──────────────────
  const handleConfirm = async () => {
    if (submitting) return;

    const adminCreating = isAdminUser(userId);

    // 페블 잔액 확인 (운영자는 면제)
    if (!adminCreating && balance < CREATE_COST) {
      setError(`페블이 부족합니다. ${(CREATE_COST - balance).toLocaleString()} P가 더 필요합니다.`);
      setShowConfirm(false);
      return;
    }

    setSubmitting(true);

    try {
      // 10,000P 차감 (운영자는 면제)
      if (!adminCreating) {
        const spent = spendUserPoints(userId, CREATE_COST, "🗳️ 보트 만들기 비용");
        if (!spent.ok) {
          setError("페블 차감에 실패했습니다. 다시 시도해주세요.");
          setShowConfirm(false);
          setSubmitting(false);
          return;
        }
      }

      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user ?? null;
      const authorId   = user?.id ?? "anon";
      const authorName =
        user?.user_metadata?.nickname ??
        user?.user_metadata?.full_name ??
        user?.user_metadata?.name ??
        user?.email?.split("@")[0] ??
        "익명";

      const filled = options.filter((o) => o.label.trim());
      const pct      = Math.floor(100 / filled.length);
      const remainder = 100 - pct * filled.length;

      const market: UserMarket = {
        id: generateMarketId(),
        question: question.trim(),
        description: description.trim(),
        category,
        resolver: resolver.trim() || "운영자 판단",
        endsAt:   kstToUtcISO(endsDate, endsTime),
        resultAt: kstToUtcISO(resultDate, resultTime),
        createdAt: new Date().toISOString(),
        totalPool: 0,
        participants: 0,
        authorId,
        authorName,
        options: filled.map((o, i) => ({
          id: `opt-${i}`,
          label: o.label.trim(),
          percentage: i === 0 ? pct + remainder : pct,
          color: o.color,
        })),
      };

      saveUserMarket(market);
      router.push(`/market/${market.id}`);
    } catch {
      setError("보트 만들기 중 오류가 발생했습니다. 다시 시도해주세요.");
      setShowConfirm(false);
      setSubmitting(false);
    }
  };

  const minDate     = nowKSTString().slice(0, 10);
  const usedColors  = options.map((o) => o.color);

  return (
    <div className="min-h-screen bg-background">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 bg-background/80 backdrop-blur-xl border-b border-border">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link href="/" className="p-2 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="text-lg font-bold text-foreground">보트 만들기</h1>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

        {/* ── 보트 수칙 ────────────────────────────────────────────────────── */}
        <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 bg-amber-500/10 border-b border-amber-500/20">
            <ShieldAlert className="size-4 text-amber-400 shrink-0" />
            <span className="text-sm font-bold text-amber-400">보트 수칙</span>
          </div>
          <ul className="px-4 py-3 space-y-2.5">
            <li className="flex gap-2.5 text-sm text-foreground/90">
              <span className="shrink-0 size-5 rounded-full bg-amber-500/20 text-amber-400 text-xs flex items-center justify-center font-bold">1</span>
              <span>누가 봐도 <strong>똑같은 결과</strong>가 나와야 합니다. <span className="text-muted-foreground">(주관적 판단 불가)</span></span>
            </li>
            <li className="flex gap-2.5 text-sm text-foreground/90">
              <span className="shrink-0 size-5 rounded-full bg-amber-500/20 text-amber-400 text-xs flex items-center justify-center font-bold">2</span>
              <span><strong>창작자가 결과를 통제</strong>할 수 있는 주제는 보트로 만들 수 없습니다.</span>
            </li>
            <li className="flex gap-2.5 text-sm text-foreground/90">
              <span className="shrink-0 size-5 rounded-full bg-amber-500/20 text-amber-400 text-xs flex items-center justify-center font-bold">3</span>
              <span>타인의 <strong>불행이나 범죄</strong>를 보트 대상으로 삼지 않습니다.</span>
            </li>
          </ul>
          <div className="flex items-start gap-2 px-4 py-3 bg-red-500/8 border-t border-red-500/20">
            <AlertTriangle className="size-3.5 text-red-400 shrink-0 mt-0.5" />
            <p className="text-xs text-red-400/90 leading-relaxed">
              위 수칙을 위반할 경우 <strong>보트 즉시 삭제, 페블 전액 몰수, 사이트 이용 차단</strong> 등의 제재를 받을 수 있습니다.
            </p>
          </div>
        </section>

        {/* 질문 */}
        <section className="space-y-2">
          <label className="text-sm font-semibold text-foreground">
            보트 질문 <span className="text-red-400">*</span>
          </label>
          <Input
            placeholder="예) 비트코인 2026년 내 20만 달러 돌파할까?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={100}
            className="text-base"
          />
          <p className="text-xs text-muted-foreground text-right">{question.length}/100</p>
        </section>

        {/* 설명 */}
        <section className="space-y-2">
          <label className="text-sm font-semibold text-foreground">
            설명 <span className="text-muted-foreground font-normal">(선택)</span>
          </label>
          <textarea
            placeholder="보트에 대한 상세 설명, 정산 기준 등을 입력하세요."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={3}
            className="w-full rounded-lg border border-border/50 bg-input px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-neon-blue/20 focus:border-neon-blue/50 resize-none"
          />
          <p className="text-xs text-muted-foreground text-right">{description.length}/500</p>
        </section>

        {/* 카테고리 */}
        <section className="space-y-2">
          <label className="text-sm font-semibold text-foreground">
            카테고리 <span className="text-red-400">*</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {MARKET_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setCategory(cat.id)}
                className={cn(
                  "px-4 py-1.5 rounded-full text-sm font-medium border transition-all",
                  category === cat.id
                    ? "bg-chart-5/15 border-chart-5/50 text-chart-5"
                    : "bg-secondary/30 border-border/50 text-muted-foreground hover:border-border"
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>
        </section>

        {/* 선택지 */}
        <section className="space-y-3">
          <label className="text-sm font-semibold text-foreground">
            선택지 <span className="text-red-400">*</span>
            <span className="text-xs text-muted-foreground font-normal ml-1.5">
              ({MIN_OPTIONS}~{MAX_OPTIONS}개)
            </span>
          </label>

          <div className="space-y-2">
            {options.map((opt, idx) => (
              <div key={idx} className="flex items-center gap-2">
                {/* 색상 선택 버튼 */}
                <ColorPicker
                  value={opt.color}
                  onChange={(color) => updateColor(idx, color)}
                  usedColors={usedColors.filter((_, i) => i !== idx)}
                />
                <Input
                  placeholder={`선택지 ${idx + 1}`}
                  value={opt.label}
                  onChange={(e) => updateLabel(idx, e.target.value)}
                  maxLength={40}
                  className="flex-1"
                  style={{ borderColor: `color-mix(in oklch, ${opt.color} 30%, transparent)` }}
                />
                {options.length > MIN_OPTIONS && (
                  <button
                    type="button"
                    onClick={() => removeOption(idx)}
                    className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-400/10 transition-colors"
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {options.length < MAX_OPTIONS && (
            <button
              type="button"
              onClick={addOption}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors py-1"
            >
              <Plus className="size-4" />
              선택지 추가
            </button>
          )}
        </section>

        {/* 보트 마감 날짜/시간 */}
        <section className="space-y-2">
          <label className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Clock className="size-3.5 text-muted-foreground" />
            보트 마감 날짜 / 시간
            <span className="text-red-400">*</span>
            <span className="text-xs text-muted-foreground font-normal ml-1">(한국시간 KST 기준)</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <Input type="date" value={endsDate} min={minDate} onChange={(e) => setEndsDate(e.target.value)} className="bg-input" />
            <Input type="time" value={endsTime} onChange={(e) => setEndsTime(e.target.value)} className="bg-input" />
          </div>
          {endsDate && endsTime && (
            <p className="text-xs text-muted-foreground">{endsDate} {endsTime} KST 마감</p>
          )}
          <p className="text-xs text-muted-foreground/70">
            * 마감 날짜 이후에는 페블 보트가 불가합니다.
          </p>
        </section>

        {/* 결과 발표 날짜/시간 */}
        <section className="space-y-2">
          <label className="text-sm font-semibold text-foreground flex items-center gap-1.5">
            <Clock className="size-3.5 text-muted-foreground" />
            결과 발표 날짜 / 시간
            <span className="text-red-400">*</span>
            <span className="text-xs text-muted-foreground font-normal ml-1">(한국시간 KST 기준)</span>
          </label>
          <p className="text-xs text-muted-foreground">보트 결과를 입력해야 하는 일시입니다. 마감 일시 이후로 설정해주세요.</p>
          <div className="grid grid-cols-2 gap-3">
            <Input type="date" value={resultDate} min={endsDate || minDate} onChange={(e) => setResultDate(e.target.value)} className="bg-input" />
            <Input type="time" value={resultTime} onChange={(e) => setResultTime(e.target.value)} className="bg-input" />
          </div>
          {resultDate && resultTime && (
            <p className="text-xs text-muted-foreground">{resultDate} {resultTime} KST 결과 발표</p>
          )}
        </section>

        {/* 정산 기준 */}
        <section className="space-y-2">
          <label className="text-sm font-semibold text-foreground">
            정산 기준 <span className="text-muted-foreground font-normal">(선택)</span>
          </label>
          <Input
            placeholder="예) 공식 발표, 운영자 판단"
            value={resolver}
            onChange={(e) => setResolver(e.target.value)}
            maxLength={60}
          />
        </section>

        {/* 에러 */}
        {error && (
          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
            <AlertCircle className="size-4 shrink-0" />
            {error}
          </div>
        )}

        {/* ── 보트 생성 전 필수 확인 사항 ─────────────────────────────────── */}
        <section className="rounded-lg border border-purple-200/70 dark:border-purple-700/40 bg-gray-50 dark:bg-gray-800 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-purple-500 shrink-0" />
            <span className="text-sm font-bold text-foreground">보트 생성 전 필수 확인 사항</span>
            <span className="ml-auto text-xs text-muted-foreground">
              {Object.values(checks).filter(Boolean).length}/{Object.values(checks).length} 완료
            </span>
          </div>

          {/* 항목 1 */}
          <label className="flex items-start gap-3 cursor-pointer group">
            <span
              className={cn(
                "shrink-0 mt-0.5 text-xs leading-none transition-opacity",
                checks.noMisfortuneOrCrime ? "opacity-0" : "opacity-100",
              )}
              aria-hidden={checks.noMisfortuneOrCrime}
              title="필수 확인"
            >
              ⚠️
            </span>
            <button
              type="button"
              onClick={() => toggleCheck("noMisfortuneOrCrime")}
              className={cn(
                "shrink-0 mt-0.5 size-5 rounded border-2 transition-all flex items-center justify-center",
                checks.noMisfortuneOrCrime
                  ? "bg-chart-5 border-chart-5 text-white"
                  : "border-border/60 bg-background group-hover:border-chart-5/50",
              )}
              aria-checked={checks.noMisfortuneOrCrime}
              role="checkbox"
            >
              {checks.noMisfortuneOrCrime && <Check className="size-3 stroke-[3]" />}
            </button>
            <span
              className={cn(
                "text-sm leading-relaxed transition-colors",
                checks.noMisfortuneOrCrime ? "text-foreground" : "text-muted-foreground",
              )}
            >
              타인의 불행이나 범죄를 보트(베팅) 대상으로 삼지 않았습니까?{" "}
              <span className="text-xs text-muted-foreground">(위반 시 제재 대상이 될 수 있습니다.)</span>
            </span>
          </label>

          {/* 항목 2 */}
          <label className="flex items-start gap-3 cursor-pointer group">
            <span
              className={cn(
                "shrink-0 mt-0.5 text-xs leading-none transition-opacity",
                checks.confirmWithin10Hours ? "opacity-0" : "opacity-100",
              )}
              aria-hidden={checks.confirmWithin10Hours}
              title="필수 확인"
            >
              ⚠️
            </span>
            <button
              type="button"
              onClick={() => toggleCheck("confirmWithin10Hours")}
              className={cn(
                "shrink-0 mt-0.5 size-5 rounded border-2 transition-all flex items-center justify-center",
                checks.confirmWithin10Hours
                  ? "bg-chart-5 border-chart-5 text-white"
                  : "border-border/60 bg-background group-hover:border-chart-5/50",
              )}
              aria-checked={checks.confirmWithin10Hours}
              role="checkbox"
            >
              {checks.confirmWithin10Hours && <Check className="size-3 stroke-[3]" />}
            </button>
            <span
              className={cn(
                "text-sm leading-relaxed transition-colors",
                checks.confirmWithin10Hours ? "text-foreground" : "text-muted-foreground",
              )}
            >
              결과 확정 예정 시간으로부터{" "}
              <span className="font-bold text-foreground">10시간</span> 이내에 반드시 결과를 확정지어야 함을 확인했습니까?{" "}
              <span className="text-xs text-muted-foreground">(미이행 시 운영자에 의해 강제 처리될 수 있습니다.)</span>
            </span>
          </label>

          {!allChecked && (
            <div className="pt-2">
              <p className="text-xs text-muted-foreground">
                위 항목을 모두 확인하셔야 보트를 생성하실 수 있습니다.
              </p>
            </div>
          )}
        </section>

        {/* 비용 안내 배너 */}
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-secondary/30 border border-border/40">
          <Coins className="size-4 text-amber-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground">보트 생성 비용</p>
            <p className="text-sm font-bold text-foreground">{CREATE_COST.toLocaleString()} P</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">보유 페블</p>
            <p className={cn("text-sm font-bold", balance >= CREATE_COST ? "text-foreground" : "text-red-400")}>
              {balance.toLocaleString()} P
            </p>
          </div>
        </div>

        {/* 하단 버튼 */}
        <div className="flex gap-3 pt-2">
          <Button variant="outline" className="flex-1" asChild>
            <Link href="/">취소</Link>
          </Button>
          <Button
            className={cn(
              "flex-1 font-bold transition-colors",
              !allChecked && "bg-secondary/60 text-muted-foreground hover:bg-secondary/60",
            )}
            onClick={handleSubmit}
            disabled={submitting || !allChecked}
            style={
              allChecked
                ? { background: "var(--chart-5)", color: "white" }
                : undefined
            }
            title={!allChecked ? "체크리스트를 모두 확인해주세요" : undefined}
          >
            보트 만들기
          </Button>
        </div>

        <p className="text-xs text-muted-foreground text-center pb-4">
          생성된 보트는 홈 화면에 즉시 표시됩니다
        </p>
      </div>

      {/* 보트 생성 확인 다이얼로그 */}
      {showConfirm && (
        <CreateConfirmDialog
          question={question}
          balance={balance}
          isAdmin={isAdminUser(userId)}
          onConfirm={handleConfirm}
          onCancel={() => setShowConfirm(false)}
          submitting={submitting}
        />
      )}
    </div>
  );
}

export default function CreateMarketPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <CreateMarketPageInner />
    </Suspense>
  );
}
