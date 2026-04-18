"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Headphones,
  Lightbulb,
  Loader2,
  MessageSquare,
  RefreshCw,
  Send,
  Trash2,
  XCircle,
} from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUserPointsBalance } from "@/lib/points";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { cn } from "@/lib/utils";
import type { CustomerCenterPostRow, InquiryStatus } from "@/lib/customer-center";

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_LABEL: Record<InquiryStatus, string> = {
  pending: "대기중",
  answered: "답변완료",
  closed: "종료",
};

const STATUS_COLOR: Record<InquiryStatus, string> = {
  pending: "text-amber-500 border-amber-500/30 bg-amber-500/10",
  answered: "text-green-500 border-green-500/30 bg-green-500/10",
  closed: "text-muted-foreground border-border/50 bg-secondary/30",
};

function StatusBadge({ status }: { status: InquiryStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full border",
        STATUS_COLOR[status],
      )}
    >
      {status === "pending" && <Clock className="size-3" />}
      {status === "answered" && <CheckCircle2 className="size-3" />}
      {status === "closed" && <XCircle className="size-3" />}
      {STATUS_LABEL[status]}
    </span>
  );
}

type PostCardProps = {
  post: CustomerCenterPostRow;
  onReplySubmit: (id: string, reply: string) => Promise<void>;
  onStatusChange: (id: string, status: InquiryStatus) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
};

function PostCard({ post, onReplySubmit, onStatusChange, onDelete }: PostCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [replyText, setReplyText] = useState(post.admin_reply ?? "");
  const [saving, setSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleReply = async () => {
    setSaving(true);
    await onReplySubmit(post.id, replyText);
    setSaving(false);
  };

  return (
    <div
      className={cn(
        "rounded-xl border bg-card/60 transition-all",
        post.category === "inquiry"
          ? "border-chart-5/25"
          : "border-border/50",
      )}
    >
      {/* 헤더 */}
      <button
        type="button"
        className="w-full text-left px-4 py-3 flex items-start gap-3"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="mt-0.5 shrink-0 text-muted-foreground">
          {post.category === "inquiry" ? (
            <MessageSquare className="size-4 text-chart-5" />
          ) : (
            <Lightbulb className="size-4 text-amber-400" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <span className="text-sm font-semibold text-foreground line-clamp-1">
              {post.title}
            </span>
            <StatusBadge status={post.status ?? "pending"} />
            {post.category === "proposal" && (
              <span className="text-[11px] text-muted-foreground">❤ {post.like_count}</span>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {post.author_display_name ?? "익명"} · {formatTime(post.created_at)}
          </p>
        </div>
        <div className="shrink-0 text-muted-foreground mt-1">
          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </div>
      </button>

      {/* 확장 본문 */}
      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-border/40 pt-3">
          {/* 원문 */}
          <div>
            <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide mb-1">
              문의/제안 내용
            </p>
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed bg-secondary/20 rounded-lg p-3">
              {post.content}
            </p>
          </div>

          {/* 기존 운영자 답변 */}
          {post.admin_reply && (
            <div className="rounded-lg border border-chart-5/25 bg-chart-5/5 p-3">
              <p className="text-xs font-semibold text-chart-5 mb-1">운영자 답변</p>
              <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
                {post.admin_reply}
              </p>
              {post.admin_replied_at && (
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  {formatTime(post.admin_replied_at)}
                </p>
              )}
            </div>
          )}

          {/* 답변 작성/수정 */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">
              {post.admin_reply ? "답변 수정" : "답변 작성"}
            </p>
            <Textarea
              ref={textareaRef}
              value={replyText}
              onChange={(e) => setReplyText(e.target.value)}
              placeholder="유저에게 보여줄 답변을 입력하세요"
              className="min-h-24 text-sm"
              disabled={saving}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleReply}
                  disabled={saving || !replyText.trim()}
                  className="gap-1.5"
                >
                  {saving ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Send className="size-3.5" />
                  )}
                  {post.admin_reply ? "수정" : "답변 등록"}
                </Button>
                {post.category === "inquiry" && (
                  <>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onStatusChange(post.id, "pending")}
                      disabled={saving || post.status === "pending"}
                      className="gap-1.5 text-amber-500 border-amber-500/30 hover:bg-amber-500/10"
                    >
                      <Clock className="size-3.5" />
                      대기중
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onStatusChange(post.id, "closed")}
                      disabled={saving || post.status === "closed"}
                      className="gap-1.5 text-muted-foreground"
                    >
                      <XCircle className="size-3.5" />
                      종료
                    </Button>
                  </>
                )}
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => onDelete(post.id)}
                disabled={saving}
                className="text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="size-3.5" />
                삭제
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function CustomerCenterAdminClient() {
  const router = useRouter();
  const { userId, points: balance } = useUserPointsBalance();
  const { isAdmin, loading: adminLoading } = useIsAdmin();

  const [category, setCategory] = useState<"all" | "inquiry" | "proposal">("inquiry");
  const [statusFilter, setStatusFilter] = useState<"all" | InquiryStatus>("all");
  const [posts, setPosts] = useState<CustomerCenterPostRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (category !== "all") params.set("category", category);
      if (statusFilter !== "all") params.set("status", statusFilter);
      params.set("page", String(p));

      const res = await fetch(`/api/admin/customer-center?${params}`, { credentials: "same-origin" });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error ?? "불러오기 실패");
      setPosts(json.posts);
      setTotal(json.total);
      setPage(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [category, statusFilter]);

  useEffect(() => {
    if (!adminLoading && isAdmin) void load(1);
  }, [load, adminLoading, isAdmin]);

  useEffect(() => {
    if (!adminLoading && !isAdmin) router.replace("/");
  }, [adminLoading, isAdmin, router]);

  const handleReply = async (id: string, reply: string) => {
    try {
      const res = await fetch("/api/admin/customer-center", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, admin_reply: reply }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "저장 실패");
      setPosts((prev) => prev.map((p) => (p.id === id ? json.post : p)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleStatusChange = async (id: string, status: InquiryStatus) => {
    try {
      const res = await fetch("/api/admin/customer-center", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "상태 변경 실패");
      setPosts((prev) => prev.map((p) => (p.id === id ? json.post : p)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("이 게시물을 삭제하시겠습니까?")) return;
    try {
      const res = await fetch(`/api/admin/customer-center?id=${id}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "삭제 실패");
      setPosts((prev) => prev.filter((p) => p.id !== id));
      setTotal((n) => n - 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const pendingCount = posts.filter((p) => p.status === "pending" && p.category === "inquiry").length;

  if (adminLoading || !isAdmin) return null;

  const PAGE_SIZE = 30;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="min-h-screen bg-background">
      <Navbar balance={balance} userId={userId} />

      {/* 상단 네비 */}
      <div className="border-b border-border/50 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-5" />
          </button>
          <Headphones className="size-5 text-chart-5" />
          <h1 className="text-lg font-bold text-foreground">고객센터 관리</h1>
          {pendingCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/30 font-bold">
              미답변 {pendingCount}건
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto gap-1.5 text-xs text-muted-foreground"
            onClick={() => load(page)}
          >
            <RefreshCw className="size-3.5" />
            새로고침
          </Button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        {/* 필터 */}
        <div className="flex flex-wrap items-center gap-3">
          <Tabs
            value={category}
            onValueChange={(v) => { setCategory(v as typeof category); setPage(1); }}
          >
            <TabsList>
              <TabsTrigger value="inquiry">
                <MessageSquare className="size-3.5 mr-1" />
                1:1 문의
              </TabsTrigger>
              <TabsTrigger value="proposal">
                <Lightbulb className="size-3.5 mr-1" />
                아이디어 제안
              </TabsTrigger>
              <TabsTrigger value="all">전체</TabsTrigger>
            </TabsList>
          </Tabs>

          {category !== "proposal" && (
            <div className="flex gap-1.5">
              {(["all", "pending", "answered", "closed"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => { setStatusFilter(s); setPage(1); }}
                  className={cn(
                    "text-xs px-2.5 py-1 rounded-full border font-medium transition-colors",
                    statusFilter === s
                      ? "bg-chart-5/15 text-chart-5 border-chart-5/30"
                      : "bg-secondary/20 text-muted-foreground border-border/50 hover:bg-secondary/40",
                  )}
                >
                  {s === "all" ? "전체" : STATUS_LABEL[s]}
                </button>
              ))}
            </div>
          )}

          <span className="text-xs text-muted-foreground ml-auto">총 {total}건</span>
        </div>

        {/* 에러 */}
        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-2.5">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}

        {/* 목록 */}
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
            불러오는 중...
          </div>
        ) : posts.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">
            해당하는 문의/제안이 없습니다.
          </div>
        ) : (
          <div className="space-y-2">
            {posts.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                onReplySubmit={handleReply}
                onStatusChange={handleStatusChange}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}

        {/* 페이지네이션 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1 || loading}
              onClick={() => load(page - 1)}
            >
              이전
            </Button>
            <span className="text-sm text-muted-foreground">
              {page} / {totalPages}
            </span>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= totalPages || loading}
              onClick={() => load(page + 1)}
            >
              다음
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
