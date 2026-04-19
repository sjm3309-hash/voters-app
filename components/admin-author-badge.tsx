/**
 * AdminAuthorBadge — 운영자 닉네임 표시 컴포넌트
 *
 * 운영자인 경우: 🛡 [보라색 방패] 닉네임 (운영자)
 * 일반 유저:    닉네임만 (children 그대로)
 */

import { isAdminUserId } from "@/lib/admin";

/** 보라색 방패 SVG 아이콘 (인라인) */
export function PurpleShieldIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      aria-label="운영자"
      role="img"
      style={{ display: "inline-block", verticalAlign: "middle", flexShrink: 0 }}
    >
      <defs>
        <linearGradient id="shield-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#7c3aed" />
        </linearGradient>
        <filter id="shield-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="1" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {/* 방패 본체 */}
      <path
        d="M12 2L4 5.5v6c0 4.418 3.357 8.55 8 9.5 4.643-.95 8-5.082 8-9.5v-6L12 2z"
        fill="url(#shield-grad)"
        filter="url(#shield-glow)"
      />
      {/* 방패 체크/별 */}
      <path
        d="M9 12l2 2 4-4"
        stroke="white"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

interface AdminAuthorBadgeProps {
  /** 표시할 닉네임 */
  name: string;
  /** Supabase user ID — 운영자 여부 판별에 사용 */
  userId?: string | null;
  /** 아이콘 크기 (px), 기본 14 */
  iconSize?: number;
  /** 추가 className */
  className?: string;
  /**
   * 일반 유저일 때 이름에 적용할 CSS color 값 (보트 댓글의 베팅 대표색 등)
   * 운영자이면 항상 보라색으로 덮어씀
   */
  inkColor?: string;
  /** span 전체에 적용할 인라인 스타일 (일반 유저 전용, 운영자는 무시) */
  style?: React.CSSProperties;
}

/**
 * 운영자이면 [보라방패 아이콘] 닉네임 **(운영자)** 형태로 렌더링.
 * 일반 유저이면 `name` + 선택적 inkColor 적용 텍스트만 반환.
 */
export function AdminAuthorBadge({
  name,
  userId,
  iconSize = 14,
  className,
  inkColor,
  style,
}: AdminAuthorBadgeProps) {
  const isAdmin = isAdminUserId(userId);

  if (!isAdmin) {
    return (
      <span
        className={className}
        style={inkColor ? { ...style, color: inkColor } : style}
      >
        {name}
      </span>
    );
  }

  return (
    <span
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: "3px" }}
    >
      <PurpleShieldIcon size={iconSize} />
      <span style={{ color: "#a855f7", fontWeight: 700 }}>{name}</span>
      <span
        style={{
          color: "#9333ea",
          fontSize: "0.72em",
          fontWeight: 600,
          letterSpacing: "0.01em",
          opacity: 0.85,
        }}
      >
        (운영자)
      </span>
    </span>
  );
}
