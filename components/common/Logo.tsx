import Link from "next/link";
import { Vote } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LogoProps {
  href?: string;
  className?: string;
  "aria-label"?: string;
}

/**
 * VOTERS 브랜드 로고 — 투표 아이콘 + 굵은 워드마크 + 보라 포인트.
 * 크기는 `className`으로 `text-*` 등을 넘겨 조절합니다.
 */
export function Logo({
  href = "/",
  className,
  "aria-label": ariaLabel = "VOTERS 홈으로 이동",
}: LogoProps) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex shrink-0 items-center gap-2 rounded-lg px-2 py-1.5 font-sans text-2xl font-black tracking-tighter text-purple-600 transition-all duration-300 hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/45 dark:text-purple-400 dark:focus-visible:ring-purple-400/40",
        className,
      )}
      aria-label={ariaLabel}
    >
      <Vote
        className="size-[1.05em] shrink-0"
        strokeWidth={2.75}
        aria-hidden
      />
      <span className="whitespace-nowrap leading-none">VOTERS</span>
    </Link>
  );
}

