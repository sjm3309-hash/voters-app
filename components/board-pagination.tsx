"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const MAX_WINDOW = 5;

export function BoardPagination(props: {
  page: number;
  totalPages: number;
  onPageChange: (next: number) => void;
  className?: string;
}) {
  const { page, totalPages, onPageChange, className } = props;

  /** 데이터가 없을 때만 숨김. 1페이지만 있어도 UI 표시(이전/다음 비활성화) */
  if (totalPages < 1) return null;

  let start = Math.max(1, page - Math.floor(MAX_WINDOW / 2));
  let end = Math.min(totalPages, start + MAX_WINDOW - 1);
  if (end - start + 1 < MAX_WINDOW) {
    start = Math.max(1, end - MAX_WINDOW + 1);
  }

  const numbers: number[] = [];
  for (let i = start; i <= end; i++) numbers.push(i);

  const prevDisabled = page <= 1;
  const nextDisabled = page >= totalPages;

  return (
    <nav
      className={cn(
        "flex flex-wrap items-center justify-center gap-2 py-3 px-2 border-t border-border/50",
        className,
      )}
      aria-label="게시판 페이지"
    >
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-w-[72px]"
        disabled={prevDisabled}
        onClick={() => !prevDisabled && onPageChange(page - 1)}
      >
        이전
      </Button>

      <div className="flex flex-wrap items-center justify-center gap-1">
        {numbers.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => totalPages > 1 && onPageChange(n)}
            disabled={totalPages <= 1 && n !== page}
            className={cn(
              "min-w-9 h-9 rounded-md text-sm font-medium transition-colors",
              n === page
                ? "bg-chart-5 text-primary-foreground shadow-sm"
                : "bg-secondary/60 text-foreground hover:bg-secondary",
              totalPages <= 1 && "cursor-default",
            )}
            aria-current={n === page ? "page" : undefined}
          >
            {n}
          </button>
        ))}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-w-[72px]"
        disabled={nextDisabled}
        onClick={() => !nextDisabled && onPageChange(page + 1)}
      >
        다음
      </Button>
    </nav>
  );
}
