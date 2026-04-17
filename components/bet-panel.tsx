"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, Minus, Plus, RotateCcw, TrendingUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { calculateExpectedPayout, ADMIN_FEE_RATE, CREATOR_FEE_RATE, DIVIDEND_RATE } from "@/lib/market-settlement";

interface MarketOption {
  id: string;
  label: string;
  percentage: number;
  color: string;
  points?: number;
}

interface BetPanelProps {
  options: MarketOption[];
  userBalance: number;
  onPlaceBet?: (optionId: string, amount: number) => void;
  /** 보트 확인 다이얼로그에 표시할 보트 질문 */
  marketQuestion?: string;
  className?: string;
}

const QUICK_AMOUNTS = [100, 500, 1000, 5000];
const MIN_BET_AMOUNT = 100;
const BET_STEP = 100;
const MAX_BET_PER_ONCE = 5000;

function VMark({ className, stroke, fill }: { className?: string; stroke: string; fill: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <path
        d="M4.5 6.5L12 18.5L19.5 6.5"
        fill={fill}
        stroke={stroke}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

// ─── 확인 다이얼로그 ──────────────────────────────────────────────────────────

interface ConfirmDialogProps {
  option: MarketOption;
  amount: number;
  marketQuestion?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function BetConfirmDialog({ option, amount, marketQuestion, onConfirm, onCancel }: ConfirmDialogProps) {
  const payout = calculateExpectedPayout(amount, option.percentage);
  const adminFee   = Math.floor(amount * (100 / (option.percentage || 100)) * ADMIN_FEE_RATE);
  const creatorFee = Math.ceil(amount * (100 / (option.percentage || 100)) * CREATOR_FEE_RATE);

  return (
    /* 백드롭 */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onCancel}
    >
      {/* 반투명 오버레이 */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

      {/* 다이얼로그 카드 */}
      <div
        className="relative w-full max-w-sm rounded-2xl border shadow-2xl overflow-hidden"
        style={{
          borderColor: `color-mix(in oklch, ${option.color} 40%, transparent)`,
          boxShadow: `0 0 40px color-mix(in oklch, ${option.color} 20%, transparent)`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 옵션 색상 배경 그라디언트 */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(135deg, color-mix(in oklch, ${option.color} 12%, transparent) 0%, color-mix(in oklch, ${option.color} 4%, transparent) 60%, transparent 100%)`,
          }}
        />

        {/* 상단 색상 띠 */}
        <div
          className="h-1.5 w-full"
          style={{ background: option.color }}
        />

        <div className="relative bg-card/90 backdrop-blur-md p-6 space-y-5">
          {/* 닫기 버튼 */}
          <button
            onClick={onCancel}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
          >
            <X className="size-4" />
          </button>

          {/* 헤더 */}
          <div className="pr-6">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="size-4 text-amber-400" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                보트 확인
              </span>
            </div>
            {marketQuestion && (
              <p className="text-sm text-foreground font-medium line-clamp-2 leading-snug">
                {marketQuestion}
              </p>
            )}
          </div>

          {/* 선택한 옵션 */}
          <div
            className="rounded-xl border px-4 py-3"
            style={{
              borderColor: `color-mix(in oklch, ${option.color} 35%, transparent)`,
              background: `color-mix(in oklch, ${option.color} 8%, transparent)`,
            }}
          >
            <p className="text-[11px] text-muted-foreground mb-1">선택한 보트 항목</p>
            <div className="flex items-center gap-2">
              <VMark
                className="size-5 shrink-0"
                stroke={option.color}
                fill={option.color}
              />
              <span
                className="text-xl font-bold leading-none"
                style={{ color: option.color }}
              >
                {option.label}
              </span>
            </div>
          </div>

          {/* 금액 / 배당 정보 */}
          <div className="grid grid-cols-2 gap-3">
            {/* 보트 포인트 */}
            <div className="rounded-xl border border-border/40 bg-secondary/30 px-3 py-3">
              <p className="text-[11px] text-muted-foreground mb-1">보트 페블</p>
              <p className="text-lg font-bold text-foreground">
                {amount.toLocaleString()}
                <span className="text-xs font-normal text-muted-foreground ml-1">P</span>
              </p>
            </div>

            {/* 예상 배당금 */}
            <div
              className="rounded-xl border px-3 py-3"
              style={{
                borderColor: `color-mix(in oklch, ${option.color} 30%, transparent)`,
                background: `color-mix(in oklch, ${option.color} 6%, transparent)`,
              }}
            >
              <div className="flex items-center gap-1 mb-1">
                <TrendingUp className="size-3" style={{ color: option.color }} />
                <p className="text-[11px] text-muted-foreground">예상 배당금</p>
              </div>
              <p className="text-lg font-bold" style={{ color: option.color }}>
                ~{payout.toLocaleString()}
                <span className="text-xs font-normal text-muted-foreground ml-1">P</span>
              </p>
            </div>
          </div>

          {/* 수수료 구조 안내 */}
          <div className="rounded-xl border border-border/30 bg-secondary/20 px-3 py-2.5 space-y-1.5">
            <div className="flex items-center gap-1 mb-1">
              <Info className="size-3 text-muted-foreground" />
              <p className="text-[11px] text-muted-foreground font-medium">수수료 구조 (총 풀 기준)</p>
            </div>
            <div className="grid grid-cols-3 gap-1 text-center">
              <div className="rounded-lg bg-secondary/40 px-2 py-1.5">
                <p className="text-[10px] text-muted-foreground">운영자</p>
                <p className="text-xs font-bold text-foreground">{(ADMIN_FEE_RATE * 100).toFixed(0)}%</p>
              </div>
              <div className="rounded-lg bg-secondary/40 px-2 py-1.5">
                <p className="text-[10px] text-muted-foreground">창작자</p>
                <p className="text-xs font-bold text-foreground">{(CREATOR_FEE_RATE * 100).toFixed(0)}%</p>
              </div>
              <div className="rounded-lg px-2 py-1.5" style={{ background: `color-mix(in oklch, ${option.color} 10%, transparent)` }}>
                <p className="text-[10px] text-muted-foreground">배당 풀</p>
                <p className="text-xs font-bold" style={{ color: option.color }}>{(DIVIDEND_RATE * 100).toFixed(0)}%</p>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">
              * 실제 배당금은 최종 베팅 분포에 따라 달라질 수 있습니다
            </p>
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
              className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-1.5"
              style={{
                background: option.color,
                color: "white",
                boxShadow: `0 4px 16px color-mix(in oklch, ${option.color} 35%, transparent)`,
              }}
            >
              <CheckCircle2 className="size-4" />
              보트 확정
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── 메인 BetPanel ────────────────────────────────────────────────────────────

export function BetPanel({ options, userBalance, onPlaceBet, marketQuestion, className }: BetPanelProps) {
  const [amount, setAmount] = useState<number>(100);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [lastQuickAmount, setLastQuickAmount] = useState<number | null>(null);

  // 확인 대기 중인 보트
  const [pendingBet, setPendingBet] = useState<{ optionId: string; option: MarketOption } | null>(null);

  const handleAmountChange = (value: string) => {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= 0) {
      const clamped = Math.min(num, userBalance, MAX_BET_PER_ONCE);
      const stepped = Math.floor(clamped / BET_STEP) * BET_STEP;
      setAmount(stepped);
    } else if (value === "") {
      setAmount(0);
    }
  };

  useEffect(() => {
    setAmount((prev) => {
      const clamped = Math.min(prev, userBalance, MAX_BET_PER_ONCE);
      return Math.floor(clamped / BET_STEP) * BET_STEP;
    });
  }, [userBalance]);

  const adjustAmount = (delta: number) => {
    setAmount((prev) => Math.max(0, Math.min(prev + delta, userBalance)));
  };

  const resetAmount = () => setAmount(0);

  /** 보트 버튼 클릭 → 확인 다이얼로그 표시 */
  const handleBetButtonClick = (option: MarketOption) => {
    if (amount < MIN_BET_AMOUNT || amount % BET_STEP !== 0 || amount > userBalance) return;
    setPendingBet({ optionId: option.id, option });
  };

  /** 확인 다이얼로그에서 "보트 확정" 클릭 */
  const handleConfirm = () => {
    if (!pendingBet || !onPlaceBet) return;
    onPlaceBet(pendingBet.optionId, amount);
    setPendingBet(null);
  };

  const calculatePotentialPayout = (percentage: number) => {
    if (amount <= 0 || percentage <= 0) return "0";
    return calculateExpectedPayout(amount, percentage).toLocaleString();
  };

  return (
    <>
      <div className={cn("space-y-6", className)}>
        {/* 현재 페블 비율 */}
        <div className="p-4 rounded-xl bg-surface-elevated border border-border/50">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">
            현재 페블 비율
          </p>
          <div className="space-y-3">
            {options.map((option) => (
              <div key={option.id} className="flex items-center justify-between">
                <span className="text-sm font-medium text-foreground">{option.label}</span>
                <span className="text-xl font-bold" style={{ color: option.color }}>
                  {option.percentage}%
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 보트 페블 입력 */}
        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">
            보트 페블
          </label>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              onClick={() => adjustAmount(-BET_STEP)}
              disabled={amount < BET_STEP}
              className="shrink-0 border-border/50 hover:bg-secondary hover:border-neon-blue/30"
            >
              <Minus className="size-4" />
              <span className="sr-only">금액 줄이기</span>
            </Button>
            <div className="relative flex-1">
              <Input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                className="text-center text-lg font-semibold bg-input border-border/50 focus-visible:border-neon-blue/50 focus-visible:ring-neon-blue/20 pr-8"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                P
              </span>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => adjustAmount(BET_STEP)}
              disabled={amount >= userBalance}
              className="shrink-0 border-border/50 hover:bg-secondary hover:border-neon-blue/30"
            >
              <Plus className="size-4" />
              <span className="sr-only">금액 늘리기</span>
            </Button>
            <Button
              variant="outline"
              size="icon"
              onClick={resetAmount}
              disabled={amount === 0}
              className="shrink-0 border-border/50 hover:bg-secondary"
            >
              <RotateCcw className="size-4" />
              <span className="sr-only">초기화</span>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            보유 페블: {userBalance.toLocaleString()} P · 1회 최대 {MAX_BET_PER_ONCE.toLocaleString()} 페블
          </p>
        </div>

        {/* 빠른 금액 버튼 */}
        <div className="flex gap-2">
          {QUICK_AMOUNTS.map((quickAmount) => (
            <button
              key={quickAmount}
              onClick={() => {
                setLastQuickAmount(quickAmount);
                setAmount((prev) => {
                  const next = Math.max(
                    0,
                    Math.min(prev + quickAmount, userBalance, MAX_BET_PER_ONCE),
                  );
                  return Math.floor(next / BET_STEP) * BET_STEP;
                });
              }}
              className={cn(
                "flex-1 py-2 rounded-lg text-sm font-medium transition-all",
                lastQuickAmount === quickAmount
                  ? "bg-neon-blue/20 text-neon-blue border border-neon-blue/30"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-transparent"
              )}
            >
              {quickAmount >= 1000 ? `${quickAmount / 1000}K` : quickAmount}
            </button>
          ))}
        </div>

        {/* 보트 버튼 (옵션 개수만큼 가변 렌더링) */}
        <div
          className={cn(
            "grid gap-3",
            options.length === 2
              ? "grid-cols-2"
              : options.length === 3
                ? "grid-cols-3"
                : "grid-cols-1",
          )}
        >
          {options.map((option) => {
            const isHovered = selectedOptionId === option.id;
            const canBet = amount >= MIN_BET_AMOUNT && amount <= userBalance && amount % BET_STEP === 0;

            return (
              <button
                key={option.id}
                onClick={() => handleBetButtonClick(option)}
                disabled={!canBet}
                onMouseEnter={() => setSelectedOptionId(option.id)}
                onMouseLeave={() => setSelectedOptionId(null)}
                className={cn(
                  "relative flex flex-col items-center justify-center py-2.5 rounded-xl font-semibold transition-colors duration-200",
                  "border-2 disabled:opacity-50 disabled:cursor-not-allowed"
                )}
                style={{
                  backgroundColor: isHovered
                    ? `color-mix(in oklch, ${option.color} 18%, transparent)`
                    : `color-mix(in oklch, ${option.color} 10%, transparent)`,
                  borderColor: isHovered
                    ? `color-mix(in oklch, ${option.color} 45%, transparent)`
                    : `color-mix(in oklch, ${option.color} 30%, transparent)`,
                  color: option.color,
                }}
              >
                <VMark
                  className="size-4 mb-1 transition-colors"
                  stroke={option.color}
                  fill={isHovered ? option.color : "transparent"}
                />
                <span className="text-sm">{option.label} 보트</span>
                <span
                  className={cn(
                    "text-xs mt-1 h-4 transition-opacity",
                    isHovered && amount > 0 ? "opacity-80" : "opacity-0"
                  )}
                >
                  예상 배당금 ~{calculatePotentialPayout(option.percentage)} P
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* 보트 확인 다이얼로그 */}
      {pendingBet && (
        <BetConfirmDialog
          option={pendingBet.option}
          amount={amount}
          marketQuestion={marketQuestion}
          onConfirm={handleConfirm}
          onCancel={() => setPendingBet(null)}
        />
      )}
    </>
  );
}
