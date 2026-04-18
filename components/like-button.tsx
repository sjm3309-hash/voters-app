"use client";

import { useEffect, useState } from "react";
import { ThumbsUp } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import type { LikeTargetType } from "@/app/api/likes/route";

interface LikeButtonProps {
  targetType: LikeTargetType;
  targetId: string;
  canLike: boolean;
  className?: string;
  initialCount?: number;
  initialLiked?: boolean;
}

export function LikeButton({
  targetType,
  targetId,
  canLike,
  className,
  initialCount = 0,
  initialLiked = false,
}: LikeButtonProps) {
  const [count, setCount] = useState(initialCount);
  const [liked, setLiked] = useState(initialLiked);
  const [loading, setLoading] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/likes?targetType=${targetType}&targetId=${encodeURIComponent(targetId)}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j.ok) return;
        setCount(j.count);
        setLiked(j.liked);
        setHydrated(true);
      })
      .catch(() => setHydrated(true));
    return () => { cancelled = true; };
  }, [targetType, targetId]);

  const handleClick = async () => {
    if (!canLike) {
      toast.error("로그인 후 이용할 수 있습니다.");
      return;
    }
    if (loading) return;
    setLoading(true);

    const prevLiked = liked;
    const prevCount = count;
    setLiked(!liked);
    setCount((n) => n + (liked ? -1 : 1));

    try {
      const res = await fetch("/api/likes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error();
      setLiked(json.liked);
      setCount(json.count);
    } catch {
      setLiked(prevLiked);
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
        liked
          ? "bg-neon-red/10 text-neon-red border-neon-red/20"
          : "bg-secondary/30 text-muted-foreground border-border/50 hover:bg-secondary/60",
        className,
      )}
      aria-label="좋아요"
      title="좋아요"
    >
      <ThumbsUp className={cn("size-4", liked && "fill-current")} />
      <span>{hydrated ? count : initialCount}</span>
    </button>
  );
}
