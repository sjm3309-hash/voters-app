"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * AdSlot — Google AdSense 광고 슬롯 컴포넌트
 *
 * 사용법:
 * 1. .env.local 에 NEXT_PUBLIC_ADSENSE_CLIENT=ca-pub-XXXXXXXXXXXXXXXX 추가
 * 2. 각 광고 위치에 맞는 data-ad-slot 값(AdSense 콘솔에서 발급)을 넣기
 * 3. app/layout.tsx 에 AdSense 스크립트 태그 추가 (하단 주석 참고)
 *
 * 개발 환경: 파란 플레이스홀더 표시
 * 운영 환경: 실제 AdSense ins 태그 렌더링
 */

export type AdFormat =
  | "auto"           // 반응형 (권장)
  | "fluid"          // 인피드 / 네이티브
  | "rectangle"      // 300×250 일반 배너
  | "horizontal"     // 728×90 리더보드
  | "vertical";      // 300×600 하프페이지

interface AdSlotProps {
  /** AdSense 개별 광고 슬롯 ID (AdSense 콘솔 > 광고 > 광고 단위) */
  slot: string;
  format?: AdFormat;
  /** 인피드 광고일 때 true */
  inFeed?: boolean;
  className?: string;
  /** 광고 영역에 표시할 레이블 (개발 모드 전용, 기본값 "Advertisement") */
  label?: string;
}

const CLIENT_ID = process.env.NEXT_PUBLIC_ADSENSE_CLIENT ?? "";
const IS_PROD = process.env.NODE_ENV === "production";

export function AdSlot({
  slot,
  format = "auto",
  inFeed = false,
  className,
  label = "광고",
}: AdSlotProps) {
  const insRef = useRef<HTMLModElement>(null);
  const pushed = useRef(false);

  useEffect(() => {
    if (!IS_PROD || !CLIENT_ID || pushed.current) return;
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ((window as any).adsbygoogle = (window as any).adsbygoogle || []).push({});
      pushed.current = true;
    } catch {
      // AdSense 스크립트가 아직 로드되지 않은 경우 무시
    }
  }, []);

  // ─── 개발 환경: 파란 플레이스홀더 ─────────────────────────────────────────
  if (!IS_PROD || !CLIENT_ID) {
    const heights: Record<AdFormat, string> = {
      auto:       "h-16 sm:h-24",
      fluid:      "h-20 sm:h-28",
      rectangle:  "h-[250px]",
      horizontal: "h-[90px]",
      vertical:   "h-[250px] sm:h-[300px]",
    };
    return (
      <div
        className={cn(
          "w-full flex flex-col items-center justify-center gap-1",
          "rounded-lg border border-dashed border-blue-400/40 bg-blue-500/5",
          heights[format],
          className,
        )}
        aria-hidden="true"
      >
        <span className="text-[10px] font-semibold tracking-widest text-blue-400/60 uppercase">
          {label}
        </span>
        {!IS_PROD && (
          <span className="text-[9px] text-blue-400/40">
            slot: {slot} · format: {format}
            {!CLIENT_ID && " · NEXT_PUBLIC_ADSENSE_CLIENT 미설정"}
          </span>
        )}
      </div>
    );
  }

  // ─── 운영 환경: 실제 AdSense ins 태그 ──────────────────────────────────────
  return (
    <div className={cn("w-full overflow-hidden", className)} aria-label="광고">
      <ins
        ref={insRef}
        className="adsbygoogle"
        style={{ display: inFeed ? "block" : "block", width: "100%" }}
        data-ad-client={CLIENT_ID}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive="true"
        {...(inFeed ? { "data-ad-layout": "in-article" } : {})}
      />
    </div>
  );
}
