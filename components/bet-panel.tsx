"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, Loader2, Minus, Plus, RotateCcw, TrendingUp, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  accentMutedBackground,
  accentMutedBorder,
  pickReadableTextOnAccent,
  resolveOptionColor,
} from "@/lib/option-colors";
import {
  calculateExpectedPayout,
  ADMIN_FEE_RATE,
  CREATOR_FEE_RATE,
  DIVIDEND_RATE,
} from "@/lib/market-settlement";

export type DistributedBetLeg = { optionId: string; amount: number };

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
  existingStakeOnMarket?: number;
  onPlaceBet?: (bets: DistributedBetLeg[]) => boolean | Promise<boolean>;
  marketQuestion?: string;
  className?: string;
}

const QUICK_AMOUNTS = [100, 500, 1000, 5000];
const MIN_BET_AMOUNT = 100;
const BET_STEP = 100;
const MAX_STAKE_PER_MARKET = 5000;

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

interface BetConfirmDialogProps {
  option: MarketOption;
  accent: string;
  amount: number;
  marketQuestion?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

function BetConfirmDialog({ option, accent, amount, marketQuestion, onConfirm, onCancel, isSubmitting }: BetConfirmDialogProps & { isSubmitting?: boolean }) {
  const payout = calculateExpectedPayout(amount, option.percentage);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm rounded-2xl border shadow-2xl overflow-hidden transition-colors duration-200"
        style={{
          borderColor: accentMutedBorder(accent),
          boxShadow: `0 0 40px ${accentMutedBackground(accent)}`,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(135deg, ${accentMutedBackground(accent)} 0%, transparent 65%)`,
          }}
        />
        <div className="h-1.5 w-full transition-colors duration-200" style={{ backgroundColor: accent }} />
        <div className="relative bg-card/90 backdrop-blur-md p-6 space-y-5">
          <button
            type="button"
            onClick={onCancel}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
          >
            <X className="size-4" />
          </button>

          <div className="pr-6">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="size-4 text-amber-400" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">보트 확인</span>
            </div>
            {marketQuestion && (
              <p className="text-sm text-foreground font-medium line-clamp-2 leading-snug">{marketQuestion}</p>
            )}
          </div>

          <div
            className="rounded-xl border px-4 py-3 transition-colors duration-200"
            style={{
              borderColor: accentMutedBorder(accent),
              backgroundColor: accentMutedBackground(accent),
            }}
          >
            <p className="text-[11px] text-muted-foreground mb-1">선택한 보트 항목</p>
            <div className="flex items-center gap-2">
              <VMark className="size-5 shrink-0" stroke={accent} fill={accent} />
              <span className="text-xl font-bold leading-none" style={{ color: accent }}>
                {option.label}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border/40 bg-secondary/30 px-3 py-3">
              <p className="text-[11px] text-muted-foreground mb-1">보트 페블</p>
              <p className="text-lg font-bold text-foreground">
                {amount.toLocaleString()}
                <span className="text-xs font-normal text-muted-foreground ml-1">P</span>
              </p>
            </div>
            <div
              className="rounded-xl border px-3 py-3 transition-colors duration-200"
              style={{
                borderColor: accentMutedBorder(accent),
                backgroundColor: accentMutedBackground(accent),
              }}
            >
              <div className="flex items-center gap-1 mb-1">
                <TrendingUp className="size-3 transition-colors duration-200" style={{ color: accent }} />
                <p className="text-xs text-muted-foreground">예상 보상</p>
              </div>
              <p className="text-lg font-bold transition-colors duration-200" style={{ color: accent }}>
                ~{payout.toLocaleString()}
                <span className="text-xs font-normal text-muted-foreground ml-1">P</span>
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border/30 bg-secondary/20 px-3 py-2.5 space-y-1.5">
            <div className="flex items-center gap-1 mb-1">
              <Info className="size-3 text-muted-foreground" />
              <p className="text-xs text-muted-foreground font-medium">페블 배분 구조</p>
            </div>
            <div className="grid grid-cols-3 gap-1 text-center">
              <div className="rounded-lg bg-secondary/40 px-2 py-1.5">
                <p className="text-xs text-muted-foreground">운영자</p>
                <p className="text-xs font-bold text-foreground">{(ADMIN_FEE_RATE * 100).toFixed(0)}%</p>
              </div>
              <div className="rounded-lg bg-secondary/40 px-2 py-1.5">
                <p className="text-xs text-muted-foreground">창작자</p>
                <p className="text-xs font-bold text-foreground">{(CREATOR_FEE_RATE * 100).toFixed(0)}%</p>
              </div>
              <div
                className="rounded-lg px-2 py-1.5 transition-colors duration-200"
                style={{ backgroundColor: accentMutedBackground(accent) }}
              >
                <p className="text-xs text-muted-foreground">보상 풀</p>
                <p className="text-xs font-bold transition-colors duration-200" style={{ color: accent }}>
                  {(DIVIDEND_RATE * 100).toFixed(0)}%
                </p>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              * 실제 보상은 최종 참여 분포에 따라 달라질 수 있습니다
            </p>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onCancel}
              disabled={isSubmitting}
              className="flex-1 py-2.5 rounded-xl border border-border/50 bg-secondary/50 hover:bg-secondary text-sm font-semibold text-muted-foreground transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              취소
            </button>
            <button
              type="button"
              onClick={onConfirm}
              disabled={isSubmitting}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors duration-200 flex items-center justify-center gap-1.5 disabled:opacity-70 disabled:cursor-not-allowed"
              style={{
                backgroundColor: accent,
                color: pickReadableTextOnAccent(accent),
                boxShadow: isSubmitting ? "none" : `0 4px 16px ${accentMutedBorder(accent)}`,
              }}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  처리 중...
                </>
              ) : (
                <>
                  <CheckCircle2 className="size-4" />
                  보트 확정
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function BetPanel({
  options,
  userBalance,
  existingStakeOnMarket = 0,
  onPlaceBet,
  marketQuestion,
  className,
}: BetPanelProps) {
  const [amount, setAmount] = useState<number>(MIN_BET_AMOUNT);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [lastQuickAmount, setLastQuickAmount] = useState<number | null>(null);

  const stakeSoFar = Math.max(0, Math.floor(existingStakeOnMarket));
  const remainingMarketCap = Math.max(0, MAX_STAKE_PER_MARKET - stakeSoFar);
  const maxAdditionalStake = Math.min(userBalance, remainingMarketCap);

  useEffect(() => {
    setAmount((prev) => {
      const clamped = Math.min(prev, maxAdditionalStake);
      return Math.floor(clamped / BET_STEP) * BET_STEP;
    });
  }, [maxAdditionalStake]);

  const [pendingBet, setPendingBet] = useState<{
    optionId: string;
    option: MarketOption;
    accent: string;
  } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAmountChange = (value: string) => {
    const num = parseInt(value, 10);
    if (!isNaN(num) && num >= 0) {
      const clamped = Math.min(num, userBalance, maxAdditionalStake);
      const stepped = Math.floor(clamped / BET_STEP) * BET_STEP;
      setAmount(stepped);
    } else if (value === "") {
      setAmount(0);
    }
  };

  const adjustAmount = (delta: number) => {
    setAmount((prev) => Math.max(0, Math.min(prev + delta, maxAdditionalStake)));
  };

  const resetAmount = () => setAmount(0);

  /** 옵션 버튼 클릭 → 확인 모달 */
  const handleBetButtonClick = (option: MarketOption, optionIndex: number) => {
    if (
      amount < MIN_BET_AMOUNT ||
      amount % BET_STEP !== 0 ||
      amount > userBalance ||
      amount > maxAdditionalStake
    )
      return;
    const accent = resolveOptionColor(option.color, optionIndex);
    setPendingBet({ optionId: option.id, option, accent });
  };

  const handleConfirm = async () => {
    if (!pendingBet || !onPlaceBet || isSubmitting) return;
    setIsSubmitting(true);
    try {
      const ok = await Promise.resolve(onPlaceBet([{ optionId: pendingBet.optionId, amount }]));
      setPendingBet(null);
      if (ok) setAmount(MIN_BET_AMOUNT);
    } finally {
      setIsSubmitting(false);
    }
  };

  const calculatePotentialPayout = (percentage: number) => {
    if (amount <= 0 || percentage <= 0) return "0";
    return calculateExpectedPayout(amount, percentage).toLocaleString();
  };

  return (
    <>
      <div className={cn("space-y-6", className)}>
        <div className="p-4 rounded-xl bg-surface-elevated border border-border/50">
          <p className="text-xs text-muted-foreground uppercase tracking-wide mb-3">현재 페블 비율</p>
          <div className="space-y-3">
            {options.map((option, index) => {
              const accent = resolveOptionColor(option.color, index);
              return (
                <div key={option.id} className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-foreground">{option.label}</span>
                  <span className="text-xl font-bold transition-colors duration-200" style={{ color: accent }}>
                    {option.percentage}%
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div>
          <label className="text-sm font-medium text-foreground mb-2 block">보트 페블</label>
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
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">P</span>
            </div>
            <Button
              variant="outline"
              size="icon"
              onClick={() => adjustAmount(BET_STEP)}
              disabled={amount >= maxAdditionalStake}
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
            보유 페블: {userBalance.toLocaleString()} P · 이 보트 한도 {MAX_STAKE_PER_MARKET.toLocaleString()} P (남음{" "}
            {remainingMarketCap.toLocaleString()} P)
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            다른 선택지에 나누어 걸려면, 확정 후 금액을 바꿔 같은 방식으로 다시 보트를 누르세요.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {QUICK_AMOUNTS.map((quickAmount) => (
            <button
              key={quickAmount}
              type="button"
              onClick={() => {
                setLastQuickAmount(quickAmount);
                setAmount((prev) => {
                  const next = Math.max(0, Math.min(prev + quickAmount, userBalance, maxAdditionalStake));
                  return Math.floor(next / BET_STEP) * BET_STEP;
                });
              }}
              className={cn(
                "w-full py-2.5 rounded-lg text-sm font-medium transition-all min-h-[44px]",
                lastQuickAmount === quickAmount
                  ? "bg-neon-blue/20 text-neon-blue border border-neon-blue/30"
                  : "bg-secondary text-secondary-foreground hover:bg-secondary/80 border border-transparent",
              )}
            >
              {quickAmount >= 1000 ? `+${quickAmount / 1000}K` : `+${quickAmount}`}
            </button>
          ))}
        </div>

        <div
          className={cn(
            "grid gap-3",
            options.length === 2
              ? "grid-cols-2"
              : options.length === 3
                ? "grid-cols-1 sm:grid-cols-3"
                : options.length === 4
                  ? "grid-cols-2"
                  : "grid-cols-1 sm:grid-cols-2",
          )}
        >
          {options.map((option, index) => {
            const accent = resolveOptionColor(option.color, index);
            const emphasized = selectedOptionId === option.id;
            const canBet =
              amount >= MIN_BET_AMOUNT &&
              amount <= userBalance &&
              amount <= maxAdditionalStake &&
              amount % BET_STEP === 0;
            const labelColor = emphasized ? pickReadableTextOnAccent(accent) : "#334155";
            const markColor = emphasized ? pickReadableTextOnAccent(accent) : accent;
            const bg = emphasized ? accent : accentMutedBackground(accent);
            const border = emphasized ? accent : accentMutedBorder(accent);

            return (
              <button
                key={option.id}
                type="button"
                onClick={() => handleBetButtonClick(option, index)}
                disabled={!canBet}
                onMouseEnter={() => setSelectedOptionId(option.id)}
                onMouseLeave={() => setSelectedOptionId(null)}
                className={cn(
                  "relative flex flex-col items-center justify-center py-2.5 rounded-xl font-semibold transition-colors duration-200",
                  "border-2 disabled:opacity-50 disabled:cursor-not-allowed",
                  emphasized && "scale-[1.02]",
                )}
                style={{
                  backgroundColor: bg,
                  borderColor: border,
                  color: labelColor,
                  boxShadow: emphasized ? `0 8px 24px ${accentMutedBorder(accent)}` : undefined,
                }}
              >
                <VMark
                  className="size-4 mb-1 shrink-0 transition-colors duration-200"
                  stroke={markColor}
                  fill={emphasized ? markColor : "transparent"}
                />
                <span className="text-sm">{option.label} 보트</span>
                <span
                  className={cn(
                    "text-xs mt-1 h-4 transition-opacity duration-200",
                    emphasized && amount > 0 ? "opacity-90" : "opacity-0",
                  )}
                  style={{ color: labelColor }}
                >
                  예상 보상 ~{calculatePotentialPayout(option.percentage)} P
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {pendingBet && (
        <BetConfirmDialog
          option={pendingBet.option}
          accent={pendingBet.accent}
          amount={amount}
          marketQuestion={marketQuestion}
          onConfirm={handleConfirm}
          onCancel={() => { if (!isSubmitting) setPendingBet(null); }}
          isSubmitting={isSubmitting}
        />
      )}
    </>
  );
}
