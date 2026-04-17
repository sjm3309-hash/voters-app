"use client";

import { cn } from "@/lib/utils";
import { useDragScroll } from "@/hooks/use-drag-scroll";

export const SPORTS_SUBCATEGORIES = [
  { id: "all" as const, label: "전체" },
  { id: "baseball_kr" as const, label: "국내야구" },
  { id: "football" as const, label: "해외축구" },
  { id: "basketball" as const, label: "농구" },
  { id: "other" as const, label: "기타" },
] as const;

export type SportsSubCategoryId = (typeof SPORTS_SUBCATEGORIES)[number]["id"];

interface SportsSubCategoryBarProps {
  selected: SportsSubCategoryId;
  onSelect: (id: SportsSubCategoryId) => void;
  className?: string;
}

export function SportsSubCategoryBar({
  selected,
  onSelect,
  className,
}: SportsSubCategoryBarProps) {
  const { ref: dragScrollRef, handlers: dragScrollHandlers } =
    useDragScroll<HTMLDivElement>();

  return (
    <div
      ref={dragScrollRef}
      className={cn(
        "w-full overflow-x-auto scrollbar-hide cursor-grab active:cursor-grabbing select-none touch-pan-x",
        "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
      {...dragScrollHandlers}
    >
      <div className="flex items-center gap-2 min-w-max py-0.5">
        {SPORTS_SUBCATEGORIES.map((item) => {
          const active = selected === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item.id)}
              className={cn(
                "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all duration-200",
                active
                  ? "bg-chart-5 text-primary-foreground shadow-md shadow-chart-5/25"
                  : "border border-border/60 bg-secondary/40 text-muted-foreground hover:border-border hover:bg-secondary/70 hover:text-foreground",
              )}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

