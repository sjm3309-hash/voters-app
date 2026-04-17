"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type CountdownTimerProps = {
  /** 베팅 마감 시간 (DB 값: ISO string 등) */
  closingAt: string | Date;
  /** 결과 확정 시간 (DB 값: ISO string 등) */
  confirmedAt: string | Date;
  className?: string;
};

const TICK_MS = 1000;
const CRITICAL_SECONDS = 300; // 5분

function toMs(d: string | Date): number {
  const date = typeof d === "string" ? new Date(d) : d;
  const ms = date.getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

function pad2(n: number): string {
  return String(Math.max(0, n)).padStart(2, "0");
}

function formatRemainingHMS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  return `${pad2(hours)}:${pad2(mins)}:${pad2(secs)}`;
}

type Phase = "beforeClose" | "beforeConfirm" | "done";

function getPhase(nowMs: number, closingMs: number, confirmedMs: number): Phase {
  if (nowMs < closingMs) return "beforeClose";
  if (nowMs < confirmedMs) return "beforeConfirm";
  return "done";
}

export function CountdownTimer({ closingAt, confirmedAt, className }: CountdownTimerProps) {
  const closingMs = useMemo(() => toMs(closingAt), [closingAt]);
  const confirmedMs = useMemo(() => toMs(confirmedAt), [confirmedAt]);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (!Number.isFinite(closingMs) || !Number.isFinite(confirmedMs)) return;
    // reset when target changes
    if (intervalRef.current != null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    const tick = () => {
      const nextNow = Date.now();
      // 결과 확정 이후에는 타이머를 멈춰 값이 흔들리지 않게 고정
      if (nextNow >= confirmedMs) {
        setNowMs(confirmedMs);
        if (intervalRef.current != null) {
          window.clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        return;
      }
      setNowMs(nextNow);
    };

    // 즉시 한 번 계산(첫 렌더 1초 지연 방지)
    tick();
    intervalRef.current = window.setInterval(tick, TICK_MS);
    return () => {
      if (intervalRef.current != null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [closingMs, confirmedMs]);

  if (!Number.isFinite(closingMs) || !Number.isFinite(confirmedMs)) {
    return (
      <div className={["font-mono tabular-nums text-xs text-muted-foreground", className].filter(Boolean).join(" ")}>
        --
      </div>
    );
  }

  const phase = getPhase(nowMs, closingMs, confirmedMs);

  // ceil 기반으로 표시: 경계 시점에서 사용자가 느끼는 "남은 시간"과 일치
  const closeDiffSec = Math.ceil((closingMs - nowMs) / 1000);
  const confirmDiffSec = Math.ceil((confirmedMs - nowMs) / 1000);

  const isCritical = phase === "beforeClose" && closeDiffSec > 0 && closeDiffSec <= CRITICAL_SECONDS;
  const timeText =
    phase === "beforeClose"
      ? `⌛ 베팅 마감까지: ${formatRemainingHMS(closeDiffSec)}`
      : phase === "beforeConfirm"
        ? `🔍 결과 확정까지: ${formatRemainingHMS(confirmDiffSec)}`
        : "✅ 결과 확정 완료";

  return (
    <div
      className={[
        "inline-flex items-center rounded-lg border px-3 py-1.5 font-mono tabular-nums text-sm transition-colors duration-300",
        phase === "beforeClose"
          ? isCritical
            ? "text-red-500 animate-pulse border-red-500/30 bg-red-500/[0.06]"
            : "text-chart-5 border-border/50 bg-secondary/10"
          : phase === "beforeConfirm"
            ? "text-purple-500 border-purple-500/25 bg-purple-500/[0.06]"
            : "text-muted-foreground border-border/40 bg-secondary/10",
        className ?? "",
      ].join(" ")}
      aria-live="polite"
    >
      {timeText}
    </div>
  );
}

