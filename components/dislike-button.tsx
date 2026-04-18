"use client";

import { useEffect, useState } from "react";
import { ThumbsDown } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { DislikeTargetType } from "@/lib/reports-config";

interface DislikeButtonProps {
  targetType: DislikeTargetType;
  targetId: string;
  canDislike: boolean;
  className?: string;
  /** 초기값 (서버에서 미리 받은 경우) */
  initialCount?: number;
  initialDisliked?: boolean;
}

export function DislikeButton({
  targetType,
  targetId,
  canDislike,
  className,
  initialCount = 0,
  initialDisliked = false,
}: DislikeButtonProps) {
  const [count, setCount] = useState(initialCount);
  const [disliked, setDisliked] = useState(initialDisliked);
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  // 마운트 시 서버에서 최신값 로드
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/dislikes?targetType=${targetType}&targetId=${encodeURIComponent(targetId)}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j.ok) return;
        setCount(j.count);
        setDisliked(j.disliked);
        setHydrated(true);
      })
      .catch(() => setHydrated(true));
    return () => { cancelled = true; };
  }, [targetType, targetId]);

  const handleClick = async () => {
    if (!canDislike) {
      toast.error("로그인 후 이용할 수 있습니다.");
      return;
    }
    if (loading) return;
    setLoading(true);

    // optimistic
    const prevDisliked = disliked;
    const prevCount    = count;
    setDisliked(!disliked);
    setCount((n) => n + (disliked ? -1 : 1));

    try {
      const res = await fetch("/api/dislikes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error();
      setDisliked(json.disliked);
      setCount(json.count);
    } catch {
      setDisliked(prevDisliked);
      setCount(prevCount);
      toast.error("처리 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 border transition-colors text-sm font-semibold",
        disliked
          ? "bg-blue-500/10 text-blue-500 border-blue-500/20"
          : "bg-secondary/30 text-muted-foreground border-border/50 hover:bg-secondary/60",
        className,
      )}
      aria-label="싫어요"
      title="싫어요"
    >
      <ThumbsDown className={cn("size-4", disliked && "fill-current")} />
      <span>{hydrated ? count : initialCount}</span>
    </button>
  );
}
