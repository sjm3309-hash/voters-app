"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { useDragScroll } from "@/hooks/use-drag-scroll";
import {
  Flame,
  Sparkles,
  Vote,
  Laugh,
  Gamepad2,
  Coins,
  TrendingUp,
  Trophy,
  LayoutGrid,
  Headphones,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import Link from "next/link";
import { usePathname } from "next/navigation";

// ─── 커스텀 아이콘 ────────────────────────────────────────────────────────────

function BasketballIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* 외곽 원 */}
      <circle cx="12" cy="12" r="9" />
      {/* 세로 중앙선 */}
      <line x1="12" y1="3" x2="12" y2="21" />
      {/* 가로 중앙선 */}
      <line x1="3" y1="12" x2="21" y2="12" />
      {/* 왼쪽 호 */}
      <path d="M5.5 5.5 Q2.5 12 5.5 18.5" />
      {/* 오른쪽 호 */}
      <path d="M18.5 5.5 Q21.5 12 18.5 18.5" />
    </svg>
  );
}

// ─── 정렬 탭 (항상 노출) ──────────────────────────────────────────────────────

const SORT_FILTERS = [
  { id: "popular", label: "인기", icon: Flame },
  { id: "recent",  label: "최신", icon: Sparkles },
] as const;

// ─── 고객센터 전용 네비게이션 탭 (필터가 아닌 페이지 이동) ───────────────────

const NAV_TABS = [
  { id: "customer-center", label: "고객센터", icon: Headphones, href: "/customer-center" },
] as const;

// ─── 카테고리 탭 ──────────────────────────────────────────────────────────────
//
//  VISIBLE_CATEGORIES  : 탭 바에 직접 노출 (최대 8개)
//  ALL_CATEGORIES      : 전체 팝오버에 표시 (VISIBLE + 나중에 추가할 탭들 포함)
//
//  나중에 탭을 추가할 때:
//    1. ALL_CATEGORIES 에 먼저 추가 → 전체 팝오버에만 표시
//    2. 바에도 노출하고 싶으면 VISIBLE_CATEGORIES 에도 추가 (최대 8개 유지)

export const VISIBLE_CATEGORIES = [
  { id: "sports",   label: "스포츠", icon: Trophy     },
  { id: "fun",      label: "재미",   icon: Laugh      },
  { id: "stocks",   label: "주식",   icon: TrendingUp },
  { id: "crypto",   label: "크립토", icon: Coins      },
  { id: "politics", label: "정치",   icon: Vote       },
  { id: "game",     label: "게임",   icon: Gamepad2   },
  // 여기에 탭 추가 시 최대 8개 유지 ↑
] as const;

export const ALL_CATEGORIES: { id: string; label: string; icon: React.ElementType }[] = [
  ...VISIBLE_CATEGORIES,
  // 전체 팝오버에서만 표시되는 숨김 카테고리
  { id: "poljjak", label: "폴짝", icon: BasketballIcon },
];

// ─── 타입 ─────────────────────────────────────────────────────────────────────

type SortId = (typeof SORT_FILTERS)[number]["id"];
export type CategoryId = (typeof VISIBLE_CATEGORIES)[number]["id"] | "all";
/** 전체 팝오버에만 표시되는 숨김 카테고리 ID */
export type HiddenCategoryId = "poljjak";
/** 정렬 탭 + 카테고리 탭 (고객센터는 NAV_TABS 링크로 별도 처리) */
export type FilterId = SortId | CategoryId | HiddenCategoryId;

interface CategoryFilterProps {
  selected: FilterId;
  onSelect: (filter: FilterId) => void;
}

// ─── Helper ───────────────────────────────────────────────────────────────────

export function isSortFilter(id: FilterId): id is SortId {
  return id === "popular" || id === "recent";
}

export function isCategoryFilter(id: FilterId): id is Exclude<FilterId, SortId> {
  return !isSortFilter(id);
}

// ─── 컴포넌트 ─────────────────────────────────────────────────────────────────

export function CategoryFilter({ selected, onSelect }: CategoryFilterProps) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const { ref: dragScrollRef, handlers: dragScrollHandlers } =
    useDragScroll<HTMLDivElement>();

  // 전체 팝오버에서 직접 노출되지 않는 오버플로 카테고리가 선택됐을 때 전체 버튼 강조
  const visibleIds = VISIBLE_CATEGORIES.map((c) => c.id as string);
  const isOverflowSelected =
    !isSortFilter(selected) &&
    selected !== "all" &&
    !visibleIds.includes(selected);

  const btnBase =
    "flex shrink-0 items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-all duration-200 whitespace-nowrap";
  const btnActive =
    "bg-chart-5 text-primary-foreground shadow-lg shadow-chart-5/25";
  const btnIdle =
    "bg-secondary text-muted-foreground hover:bg-secondary/80 hover:text-foreground border border-border/50";

  return (
    <div
      ref={dragScrollRef}
      className={cn(
        "w-full overflow-x-auto scrollbar-hide cursor-grab active:cursor-grabbing select-none touch-pan-x",
        "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
      )}
      {...dragScrollHandlers}
    >
      <div className="flex items-center gap-2.5 min-w-max py-0.5">

        {/* ── 정렬 탭 ── */}
        {SORT_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => onSelect(f.id)}
            className={cn(btnBase, selected === f.id ? btnActive : btnIdle)}
          >
            <f.icon className="size-4" />
            <span>{f.label}</span>
          </button>
        ))}

        {/* ── 구분선 ── */}
        <div className="mx-2 h-7 w-px bg-border/70 shrink-0" aria-hidden="true" />

        {/* ── 카테고리 탭 (최대 8개 직접 노출) ── */}
        {VISIBLE_CATEGORIES.map((c) => (
          <button
            key={c.id}
            onClick={() => onSelect(c.id as FilterId)}
            className={cn(btnBase, selected === c.id ? btnActive : btnIdle)}
          >
            <c.icon className="size-4" />
            <span>{c.label}</span>
          </button>
        ))}

        {/* ── 고객센터 등 페이지 이동 탭 ── */}
        {NAV_TABS.map((t) => (
          <Link
            key={t.id}
            href={t.href}
            className={cn(
              btnBase,
              "gap-1.5",
              pathname.startsWith(t.href) ? btnActive : btnIdle,
            )}
          >
            <t.icon className="size-4" />
            <span>{t.label}</span>
          </Link>
        ))}

        {/* ── 전체 (팝오버 메뉴) ── */}
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              className={cn(
                btnBase,
                isOverflowSelected ? btnActive : btnIdle,
                "gap-1.5",
              )}
            >
              <LayoutGrid className="size-4" />
              <span>전체</span>
            </button>
          </PopoverTrigger>

          <PopoverContent
            align="start"
            sideOffset={8}
            className="w-64 p-3"
          >
            <p className="text-xs font-semibold text-muted-foreground mb-2 px-1">
              카테고리 전체 목록
            </p>
            <div className="grid grid-cols-3 gap-2">
              {ALL_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  onClick={() => {
                    onSelect(c.id as FilterId);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex flex-col items-center gap-1 px-2 py-2.5 rounded-lg text-xs font-medium transition-all duration-150",
                    selected === c.id
                      ? "bg-chart-5 text-primary-foreground shadow shadow-chart-5/30"
                      : "bg-secondary/60 text-muted-foreground hover:bg-secondary hover:text-foreground",
                  )}
                >
                  <c.icon className="size-4" />
                  <span>{c.label}</span>
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>

      </div>
    </div>
  );
}
