"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, Headphones, Heart, Loader2, Lock, MessageSquare } from "lucide-react";
import { AdminAuthorBadge } from "@/components/admin-author-badge";
import { Navbar } from "@/components/navbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  fetchCustomerCenterPostById,
  fetchUserLikedProposalIds,
  toggleProposalLike,
  type CustomerCenterPostRow,
} from "@/lib/customer-center";
import { useUserPointsBalance } from "@/lib/points";
import { cn } from "@/lib/utils";

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function CustomerCenterDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { userId, points: userBalance } = useUserPointsBalance();
  const canLike = userId !== "anon";

  const [loading, setLoading] = useState(true);
  const [post, setPost] = useState<CustomerCenterPostRow | null>(null);
  const [liked, setLiked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error } = await fetchCustomerCenterPostById(id);
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setPost(null);
        setLoading(false);
        return;
      }
      setPost(data);
      setLoading(false);
      if (data?.category === "proposal") {
        const ids = await fetchUserLikedProposalIds([data.id]);
        setLiked(ids.has(data.id));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  const badge = useMemo(() => {
    if (!post) return null;
    if (post.category === "inquiry") {
      return (
        <Badge variant="outline" className="border-chart-5/30 bg-chart-5/5 text-chart-5">
          <Lock className="mr-1 size-3.5" />
          1:1 문의(비공개)
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="border-chart-5/30 bg-chart-5/5 text-chart-5">
        <Heart className="mr-1 size-3.5" />
        아이디어 제안(공개)
      </Badge>
    );
  }, [post]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar balance={userBalance} userId={userId} />
      <main className="px-4 md:px-6 py-6 md:py-8 max-w-3xl mx-auto">
        <Button variant="ghost" onClick={() => router.push("/customer-center")} className="-ml-2 mb-4">
          <ArrowLeft className="size-4" />
          고객센터
        </Button>

        {loading ? (
          <div className="rounded-xl border border-border/60 bg-card/60 p-6 flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            불러오는 중...
          </div>
        ) : !post ? (
          <div className="rounded-xl border border-border/60 bg-card/60 p-6">
            <h1 className="text-xl font-bold text-foreground mb-2 flex items-center gap-2">
              <Headphones className="size-5 text-chart-5" />
              찾을 수 없거나 권한이 없습니다
            </h1>
            {error && <p className="text-sm text-muted-foreground mb-4">{error}</p>}
            <Link href="/customer-center" className="text-sm font-semibold text-chart-5 hover:underline">
              고객센터로 이동
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border border-border/60 bg-card/60 p-5 md:p-6 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-2 min-w-0">
                {badge}
                <h1 className="text-xl md:text-2xl font-black text-foreground leading-snug break-words">
                  {post.title}
                </h1>
                <p className="text-xs text-muted-foreground">
                  <AdminAuthorBadge
                    name={post.author_display_name ?? "익명"}
                    userId={post.user_id}
                    iconSize={11}
                  />
                  {" · "}{formatTime(post.created_at)}
                </p>
              </div>

              {post.category === "proposal" && (
                <button
                  type="button"
                  className={cn(
                    "shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 border text-sm font-semibold transition-colors",
                    liked
                      ? "bg-neon-red/10 text-neon-red border-neon-red/20"
                      : "bg-secondary/30 text-muted-foreground border-border/50 hover:bg-secondary/60",
                  )}
                  disabled={!canLike}
                  onClick={async () => {
                    const next = await toggleProposalLike({ postId: post.id, currentlyLiked: liked });
                    if (next.error) {
                      setError(next.error.message);
                      return;
                    }
                    setLiked(next.liked);
                    setPost((p) => (p ? { ...p, like_count: next.likeCount } : p));
                  }}
                >
                  <Heart className={cn("size-4", liked ? "fill-current" : "")} />
                  <span>{post.like_count}</span>
                </button>
              )}
            </div>

            <div className="whitespace-pre-wrap text-sm text-foreground leading-relaxed">
              {post.content}
            </div>

            {/* 운영자 답변 */}
            {post.admin_reply ? (
              <div className="rounded-xl border border-chart-5/30 bg-chart-5/5 p-4 space-y-2">
                <div className="flex items-center gap-2 text-chart-5">
                  <CheckCircle2 className="size-4" />
                  <span className="text-sm font-bold">운영자 답변</span>
                  {post.admin_replied_at && (
                    <span className="text-xs text-muted-foreground ml-auto">
                      {formatTime(post.admin_replied_at)}
                    </span>
                  )}
                </div>
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                  {post.admin_reply}
                </p>
              </div>
            ) : post.category === "inquiry" ? (
              <div className="rounded-xl border border-border/40 bg-secondary/10 p-4 flex items-center gap-2 text-muted-foreground">
                <MessageSquare className="size-4 shrink-0" />
                <p className="text-sm">운영자가 확인 후 답변을 드릴 예정입니다. 잠시 기다려 주세요.</p>
              </div>
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}

