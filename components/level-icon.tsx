"use client";

import { useEffect, useState } from "react";
import {
  getLevelTier,
  getTierByLevel,
  getCachedAuthorPoints,
  getCachedAuthorManualLevel,
  COLOR_HEX,
  levelLabelTrackingClassName,
  type ShapeName,
} from "@/lib/level-system";
import { cn } from "@/lib/utils";

interface LevelIconProps {
  /** 레벨 번호 직접 지정 (1-56). level과 points 중 하나 필요 */
  level?: number;
  /** 총 보유 포인트 (level 미지정 시 레벨 계산에 사용) */
  points?: number;
  /** 아이콘 크기(px). 기본 18 */
  size?: number;
  className?: string;
  /** 툴팁(title) 숨기기 */
  hideTitle?: boolean;
}

// ─── SVG 다각형 좌표 계산 ─────────────────────────────────────────────────────

function polyPoints(sides: number, r: number, cx: number, cy: number): string {
  return Array.from({ length: sides }, (_, i) => {
    // 꼭대기에서 시작 (-π/2)
    const angle = (2 * Math.PI * i) / sides - Math.PI / 2;
    return `${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`;
  }).join(" ");
}

/** 도형 종류별 SVG 변수 */
const SHAPE_SIDES: Record<ShapeName, number | "circle"> = {
  circle:   "circle",
  triangle: 3,
  square:   4,
  pentagon: 5,
  hexagon:  6,
  heptagon: 7,
  octagon:  8,
};

// ─── 무지개 그라디언트 정의 ───────────────────────────────────────────────────
const RAINBOW_STOPS = [
  { offset: "0%",   color: "#ef4444" }, // 빨강
  { offset: "17%",  color: "#f97316" }, // 주황
  { offset: "33%",  color: "#eab308" }, // 노랑
  { offset: "50%",  color: "#22c55e" }, // 초록
  { offset: "67%",  color: "#3b82f6" }, // 파랑
  { offset: "83%",  color: "#6366f1" }, // 남색
  { offset: "100%", color: "#a855f7" }, // 보라
];

// ─── 메인 컴포넌트 ────────────────────────────────────────────────────────────

export function LevelIcon({ level, points, size = 18, className, hideTitle = false }: LevelIconProps) {
  const { tier, shape, color, label } = level !== undefined
    ? getTierByLevel(level)
    : getLevelTier(points ?? 0);
  const sides = SHAPE_SIDES[shape];
  const isRainbow = color === "rainbow";
  const fill = COLOR_HEX[color];

  // 각 인스턴스별 고유 gradient id
  const gradId = `lv-rainbow-${tier}`;

  const cx = 12, cy = 12;
  // 삼각형은 꼭짓점이 날카로워 반지름을 약간 줄임
  const r = shape === "triangle" ? 8.5 : 9;

  const fillAttr = isRainbow ? `url(#${gradId})` : (fill ?? "#a855f7");
  const strokeAttr = isRainbow ? "none" : `${fill}99`;

  // 빛나는 느낌의 추가 stroke (밝은 색 테두리)
  const glowColor = isRainbow ? "#ffffff66" : `${fill}55`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
      aria-label={label}
    >
      <defs>
        {isRainbow && (
          <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
            {RAINBOW_STOPS.map((s) => (
              <stop key={s.offset} offset={s.offset} stopColor={s.color} />
            ))}
          </linearGradient>
        )}
        {/* 글로우 필터 */}
        <filter id={`glow-${tier}`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1.2" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {!hideTitle && <title>{label}</title>}

      {sides === "circle" ? (
        <>
          {/* 그림자 원 */}
          <circle cx={cx} cy={cy} r={r} fill={fillAttr} opacity={0.25} transform="translate(0.5,0.5)" />
          {/* 메인 원 */}
          <circle
            cx={cx} cy={cy} r={r}
            fill={fillAttr}
            stroke={strokeAttr}
            strokeWidth={0.8}
            filter={`url(#glow-${tier})`}
          />
          {/* 하이라이트 */}
          <circle cx={cx - 2.5} cy={cy - 2.5} r={2} fill="white" opacity={0.35} />
        </>
      ) : (
        <>
          {/* 그림자 다각형 */}
          <polygon
            points={polyPoints(sides, r, cx, cy)}
            fill={fillAttr}
            opacity={0.25}
            transform="translate(0.5,0.5)"
          />
          {/* 메인 다각형 */}
          <polygon
            points={polyPoints(sides, r, cx, cy)}
            fill={fillAttr}
            stroke={strokeAttr}
            strokeWidth={0.8}
            strokeLinejoin="round"
            filter={`url(#glow-${tier})`}
          />
          {/* 하이라이트 (좌상단 작은 원) */}
          <circle cx={cx - 2} cy={cy - 2.5} r={1.8} fill="white" opacity={0.3} />
        </>
      )}
    </svg>
  );
}

// ─── 레벨 배지 (아이콘 + 텍스트 조합) ────────────────────────────────────────

interface LevelBadgeProps {
  level?: number;
  points?: number;
  size?: number;
  showLabel?: boolean;
  className?: string;
}

export function LevelBadge({ level, points, size = 16, showLabel = false, className }: LevelBadgeProps) {
  const tier = level !== undefined ? getTierByLevel(level) : getLevelTier(points ?? 0);

  return (
    <span
      className={`inline-flex items-center gap-1 ${className ?? ""}`}
      title={tier.label}
    >
      <LevelIcon level={level} points={points} size={size} hideTitle />
      {showLabel && (
        <span className={cn("text-[10px] font-bold leading-none", levelLabelTrackingClassName)}>
          {tier.label}
        </span>
      )}
    </span>
  );
}

// ─── 레벨 진행바 (프로필 등) ─────────────────────────────────────────────────

interface LevelProgressProps {
  /** 레벨 번호 직접 지정 (1-56) */
  level?: number;
  /** 포인트 기반 계산 (level 미지정 시) */
  points?: number;
  className?: string;
}

export function LevelProgress({ level, points, className }: LevelProgressProps) {
  const { level: lv, label, color } = level !== undefined
    ? getTierByLevel(level)
    : getLevelTier(points ?? 0);

  const isRainbow = color === "rainbow";
  const barColor = isRainbow
    ? "bg-gradient-to-r from-red-400 via-yellow-400 via-green-400 via-blue-400 to-purple-500"
    : ({
        red:     "bg-red-500",
        orange:  "bg-orange-500",
        yellow:  "bg-yellow-500",
        green:   "bg-green-500",
        blue:    "bg-blue-500",
        indigo:  "bg-indigo-500",
        purple:  "bg-purple-500",
        rainbow: "bg-purple-500",
      } as Record<string, string>)[color];

  return (
    <div className={className}>
      <div className="flex items-center gap-1.5">
        <LevelIcon level={level} points={points} size={16} />
        <span className={cn("text-sm font-bold text-foreground", levelLabelTrackingClassName)}>{label}</span>
        {lv >= 56 && <span className="text-xs text-chart-5 font-bold ml-auto">MAX</span>}
      </div>
      <div className="mt-1.5 h-1.5 w-full rounded-full overflow-hidden" style={{
        background: `color-mix(in oklch, var(--secondary) 80%, transparent)`,
      }}>
        <div
          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
          style={{ width: lv >= 56 ? "100%" : `${Math.round(((lv - 1) % 8) / 8 * 100)}%` }}
        />
      </div>
    </div>
  );
}

// ─── 작성자 이름 기반 레벨 아이콘 ────────────────────────────────────────────
// 게시글/댓글의 작성자 표시명을 받아 캐시에서 포인트를 조회해 아이콘을 표시합니다.

interface AuthorLevelIconProps {
  /** 게시글/댓글 작성자 display name */
  name: string;
  size?: number;
  className?: string;
}

export function AuthorLevelIcon({ name, size = 14, className }: AuthorLevelIconProps) {
  const [manualLevel, setManualLevel] = useState<number | null>(null);
  const [points, setPoints] = useState<number>(0);

  useEffect(() => {
    setManualLevel(getCachedAuthorManualLevel(name));
    setPoints(getCachedAuthorPoints(name));

    const onUpdate = () => {
      setManualLevel(getCachedAuthorManualLevel(name));
      setPoints(getCachedAuthorPoints(name));
    };
    window.addEventListener("voters:pointsUpdated", onUpdate);
    window.addEventListener("voters:levelUpdated", onUpdate);
    return () => {
      window.removeEventListener("voters:pointsUpdated", onUpdate);
      window.removeEventListener("voters:levelUpdated", onUpdate);
    };
  }, [name]);

  // 수동 레벨 캐시가 있으면 우선 사용, 없으면 포인트 기반 폴백
  if (manualLevel !== null) {
    return <LevelIcon level={manualLevel} size={size} className={className} />;
  }
  return <LevelIcon points={points} size={size} className={className} />;
}
