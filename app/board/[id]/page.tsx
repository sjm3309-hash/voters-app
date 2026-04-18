"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, CornerDownRight, Eye, Heart, Loader2, MessageSquare, Pencil, Tag, Trash2 } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { type BoardPost } from "@/lib/board";
import type { PostComment } from "@/app/api/post-comments/route";
import { getLikeCount, hasLiked, toggleLike } from "@/lib/likes";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { useUserPointsBalance } from "@/lib/points";
import { checkAndGrantCommentReward } from "@/lib/daily-rewards";
import { createClient } from "@/utils/supabase/client";
import { AdSlot } from "@/components/ads/ad-slot";
import { AdminAuthorBadge } from "@/components/admin-author-badge";
import { AuthorLevelIcon } from "@/components/level-icon";
import { isAdminUserId } from "@/lib/admin";
import { ReportButton } from "@/components/report-button";
import { DislikeButton } from "@/components/dislike-button";

const AD_COMMENT_SLOT = process.env.NEXT_PUBLIC_AD_SLOT_COMMENT ?? "1111111111";
import { safeReturnPath } from "@/lib/board-navigation";
import { toast } from "sonner";

const categoryLabel: Record<BoardPost["category"], string> = {
  sports: "⚽ 스포츠",
  fun: "😄 재미",
  stocks: "📈 주식",
  crypto: "🪙 크립토",
  politics: "🏛️ 정치",
  game: "🎮 게임",
};

function formatTimestamp(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const minutes = Math.floor(diff / (1000 * 60));
  const hours = Math.floor(diff / (1000 * 60 * 60));

  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  if (hours < 24) return `${hours}시간 전`;
  return date.toLocaleDateString("ko-KR", { month: "numeric", day: "numeric" });
}

export default function BoardPostPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const params = useParams();
  const id = params.id as string;

  const listHref = useMemo(
    () => safeReturnPath(searchParams.get("next"), "/board"),
    [searchParams],
  );

  const [post, setPost] = useState<BoardPost | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [comments, setComments] = useState<PostComment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  // 대댓글 상태
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");

  const { userId, points: userBalance } = useUserPointsBalance();
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [currentDisplayName, setCurrentDisplayName] = useState<string>("");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const u = data?.user;
      if (!u) return;
      setCurrentUserId(u.id);
      const name =
        u.user_metadata?.nickname ??
        u.user_metadata?.full_name ??
        u.user_metadata?.name ??
        u.email?.split("@")[0] ?? "";
      setCurrentDisplayName(name);
    });
  }, [userId]);

  // ─── 게시글 로드 ─────────────────────────────────────────────────────────
  const loadPost = useCallback(async () => {
    try {
      const res = await fetch(`/api/board-posts?id=${encodeURIComponent(id)}`, {
        credentials: "same-origin",
      });
      const json = await res.json();
      if (json.ok && json.post) {
        setPost(json.post as BoardPost);
      } else {
        setPost(null);
      }
    } catch {
      setPost(null);
    } finally {
      setLoaded(true);
    }
  }, [id]);

  useEffect(() => {
    loadPost();
  }, [loadPost]);

  // ─── 댓글 로드 ──────────────────────────────────────────────────────────
  const loadComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/post-comments?postId=${encodeURIComponent(id)}`, {
        credentials: "same-origin",
      });
      const json = await res.json();
      if (json.ok && Array.isArray(json.comments)) {
        setComments(json.comments);
      }
    } catch {
      // ignore
    }
  }, [id]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  // ─── Supabase Realtime: 새 댓글 실시간 구독 ─────────────────────────────
  useEffect(() => {
    if (!id) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`post_comments_${id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "post_comments",
          filter: `post_id=eq.${id}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const newComment: PostComment = {
            id: String(row.id),
            postId: String(row.post_id),
            parentId: typeof row.parent_id === "string" ? row.parent_id : null,
            authorId: typeof row.author_id === "string" ? row.author_id : null,
            authorDisplay: String(row.author_display ?? "익명"),
            content: String(row.content),
            createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
            replies: [],
          };
          setComments((prev) => {
            if (newComment.parentId) {
              // 대댓글: 부모 댓글 replies에 추가
              const updated = prev.map((c) => {
                if (c.id === newComment.parentId) {
                  const alreadyExists = c.replies?.some((r) => r.id === newComment.id);
                  if (alreadyExists) return c;
                  return { ...c, replies: [...(c.replies ?? []), newComment] };
                }
                return c;
              });
              return updated;
            }
            if (prev.some((c) => c.id === newComment.id)) return prev;
            return [...prev, newComment];
          });
          // comment_count도 post에 반영
          setPost((p) => p ? { ...p, commentCount: p.commentCount + 1 } : p);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "post_comments",
          filter: `post_id=eq.${id}`,
        },
        (payload) => {
          const row = payload.new as Record<string, unknown>;
          const updatedId = String(row.id);
          const isDeleted = !!row.is_deleted;
          setComments((prev) =>
            prev.map((c) => {
              if (c.id === updatedId) return { ...c, isDeleted };
              return {
                ...c,
                replies: (c.replies ?? []).map((r) =>
                  r.id === updatedId ? { ...r, isDeleted } : r
                ),
              };
            })
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  const canComment = userId !== "anon" && !!currentUserId;
  const likeUserId = userId !== "anon" ? userId : "anon";
  const likeTarget = useMemo(() => ({ type: "post" as const, id }), [id]);
  const [likeCount, setLikeCount] = useState<number>(0);
  const [liked, setLiked] = useState<boolean>(false);

  useEffect(() => {
    setLikeCount(getLikeCount(likeTarget));
    setLiked(hasLiked(likeTarget, likeUserId));
  }, [likeTarget, likeUserId]);

  useEffect(() => {
    const onLikesUpdated = () => {
      setLikeCount(getLikeCount(likeTarget));
      setLiked(hasLiked(likeTarget, likeUserId));
    };
    window.addEventListener("voters:likesUpdated", onLikesUpdated as EventListener);
    window.addEventListener("storage", onLikesUpdated as EventListener);
    return () => {
      window.removeEventListener("voters:likesUpdated", onLikesUpdated as EventListener);
      window.removeEventListener("storage", onLikesUpdated as EventListener);
    };
  }, [likeTarget, likeUserId]);

  useEffect(() => {
    if (!post) return;
    if (!isEditing) return;
    setEditTitle(post.title);
    setEditContent(post.content);
  }, [isEditing, post]);

  const canManage = !!post && !!currentUserId && post.authorId === currentUserId;

  const handleSubmitComment = async () => {
    const trimmed = commentText.trim();
    if (!trimmed || isSubmittingComment) return;

    setIsSubmittingComment(true);
    try {
      const res = await fetch("/api/post-comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ postId: id, content: trimmed }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast.error(json.message ?? "댓글 등록에 실패했습니다.");
        return;
      }
      setCommentText("");
      if (json.comment) {
        setComments((prev) => {
          if (prev.some((c) => c.id === json.comment.id)) return prev;
          return [...prev, { ...json.comment, replies: [] }];
        });
        setPost((p) => p ? { ...p, commentCount: p.commentCount + 1 } : p);
      }
      void checkAndGrantCommentReward(userId);
    } catch {
      toast.error("댓글 등록 중 오류가 발생했습니다.");
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleSubmitReply = async (parentId: string) => {
    const trimmed = replyText.trim();
    if (!trimmed) return;
    setIsSubmittingComment(true);
    try {
      const res = await fetch("/api/post-comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ postId: id, content: trimmed, parentId }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast.error(json.message ?? "대댓글 등록에 실패했습니다.");
        return;
      }
      setReplyText("");
      setReplyingToId(null);
      if (json.comment) {
        setComments((prev) =>
          prev.map((c) => {
            if (c.id === parentId) {
              const alreadyExists = c.replies?.some((r) => r.id === json.comment.id);
              if (alreadyExists) return c;
              return { ...c, replies: [...(c.replies ?? []), { ...json.comment, replies: [] }] };
            }
            return c;
          })
        );
        setPost((p) => p ? { ...p, commentCount: p.commentCount + 1 } : p);
      }
    } catch {
      toast.error("대댓글 등록 중 오류가 발생했습니다.");
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string, parentId?: string | null) => {
    const ok = window.confirm("댓글을 삭제하시겠습니까?");
    if (!ok) return;
    try {
      const res = await fetch(`/api/post-comments?id=${encodeURIComponent(commentId)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast.error("댓글 삭제에 실패했습니다.");
        return;
      }
      // 소프트 삭제: 내용 대신 삭제됨 표시
      const markDeleted = (c: import("@/app/api/post-comments/route").PostComment) =>
        c.id === commentId ? { ...c, isDeleted: true } : c;
      if (parentId) {
        setComments((prev) =>
          prev.map((c) =>
            c.id === parentId
              ? { ...c, replies: (c.replies ?? []).map(markDeleted) }
              : c
          )
        );
      } else {
        setComments((prev) => prev.map(markDeleted));
      }
    } catch {
      toast.error("댓글 삭제 중 오류가 발생했습니다.");
    }
  };

  const handleSaveEdit = async () => {
    const t = editTitle.trim();
    const c = editContent.trim();
    if (!t || !c) return;
    setIsSavingEdit(true);
    try {
      const res = await fetch(`/api/board-posts?id=${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ title: t, content: c }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast.error("수정에 실패했습니다.");
        return;
      }
      setPost((p) => p ? { ...p, title: t, content: c } : p);
      setIsEditing(false);
      toast.success("게시글이 수정되었습니다.");
    } catch {
      toast.error("수정 중 오류가 발생했습니다.");
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleDelete = async () => {
    const ok = window.confirm("정말로 이 게시글을 삭제할까요? 댓글도 함께 삭제됩니다.");
    if (!ok) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/board-posts?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        toast.error("삭제에 실패했습니다.");
        return;
      }
      toast.success("게시글이 삭제되었습니다.");
      router.push(listHref);
    } catch {
      toast.error("삭제 중 오류가 발생했습니다.");
    } finally {
      setIsDeleting(false);
    }
  };

  if (!loaded) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar balance={userBalance} userId={userId} />
        <main className="px-4 md:px-6 py-10 max-w-4xl mx-auto">
          <Button variant="ghost" onClick={() => router.push(listHref)} className="-ml-2">
            <ArrowLeft className="size-4" />
            돌아가기
          </Button>
          <div className="mt-10 flex justify-center">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        </main>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar balance={userBalance} userId={userId} />
        <main className="px-4 md:px-6 py-10 max-w-4xl mx-auto">
          <Button variant="ghost" onClick={() => router.push(listHref)} className="-ml-2">
            <ArrowLeft className="size-4" />
            돌아가기
          </Button>
          <div className="mt-6 text-muted-foreground">
            존재하지 않는 게시글입니다.
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar balance={userBalance} userId={userId} />

      <main className="px-4 md:px-6 py-6 md:py-8 max-w-4xl mx-auto">
        <Button variant="ghost" onClick={() => router.push(listHref)} className="-ml-2 mb-4">
          <ArrowLeft className="size-4" />
          목록
        </Button>

        <Card>
          <CardHeader className="gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Tag className="size-4" />
                {categoryLabel[post.category]}
              </span>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                {!isAdminUserId(post.authorId) && (
                  <AuthorLevelIcon name={post.author} size={14} />
                )}
                <AdminAuthorBadge
                  name={post.author}
                  userId={post.authorId}
                  iconSize={13}
                  className="font-medium text-foreground"
                />
              </span>
              <span>·</span>
              <span>{formatTimestamp(new Date(post.createdAt))}</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <Eye className="size-4" />
                {post.views ?? 0}
              </span>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <MessageSquare className="size-4" />
                {post.commentCount}
              </span>
              <span>·</span>
              <button
                type="button"
                className={cn(
                  "inline-flex items-center gap-1 rounded-md px-2 py-1 transition-colors",
                  liked ? "bg-neon-red/10 text-neon-red" : "hover:bg-secondary"
                )}
                onClick={() => {
                  const next = toggleLike(likeTarget, likeUserId);
                  setLikeCount(next.count);
                  setLiked(next.liked);
                }}
                aria-label="좋아요"
              >
                <Heart className={cn("size-4", liked ? "fill-current" : "")} />
                <span className="text-sm font-medium">{likeCount}</span>
              </button>
              <DislikeButton
                targetType="board_post"
                targetId={id}
                canDislike={canComment}
              />
              <ReportButton
                targetType="board_post"
                targetId={id}
                canReport={canComment}
              />
            </div>
            <div className="flex items-start justify-between gap-3">
              <CardTitle className="text-xl md:text-2xl leading-snug break-words">
                {isEditing ? "게시글 수정" : post.title}
              </CardTitle>
              {canManage && !isEditing && (
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                    <Pencil className="size-4" />
                    수정
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleDelete}
                    disabled={isDeleting}
                  >
                    {isDeleting ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
                    삭제
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>

          <CardContent>
            {post.images && post.images.length > 0 && (
              <div className="mb-5 space-y-3">
                {post.images.map((src, idx) => (
                  <a
                    key={`${src}-${idx}`}
                    href={src}
                    target="_blank"
                    rel="noreferrer"
                    className="block overflow-hidden rounded-xl border border-border/50 bg-secondary/10"
                  >
                    <img
                      src={src}
                      alt=""
                      className="w-full max-h-[520px] object-contain bg-black/5"
                    />
                  </a>
                ))}
              </div>
            )}
            {isEditing ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>제목</Label>
                  <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>내용</Label>
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    className="min-h-40"
                  />
                </div>
                <div className="flex items-center justify-end gap-2">
                  <Button variant="outline" onClick={() => setIsEditing(false)}>
                    취소
                  </Button>
                  <Button
                    onClick={handleSaveEdit}
                    disabled={!editTitle.trim() || !editContent.trim() || isSavingEdit}
                  >
                    {isSavingEdit ? <Loader2 className="size-4 animate-spin" /> : "저장"}
                  </Button>
                </div>
              </div>
            ) : post.contentHtml ? (
              <div
                className="prose prose-sm md:prose-base max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-a:text-neon-blue prose-a:underline-offset-4"
                dangerouslySetInnerHTML={{ __html: sanitizeHtml(post.contentHtml) }}
              />
            ) : (
              <div className="text-sm md:text-base leading-relaxed whitespace-pre-wrap text-foreground">
                {post.content}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ─── 댓글 섹션 ──────────────────────────────────────────────── */}
        <div className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">
              댓글 <span className="text-muted-foreground">({post.commentCount})</span>
            </h2>
          </div>
          <Separator className="my-3" />

          <div className="space-y-4">
            {comments.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">
                아직 댓글이 없습니다. 첫 댓글을 남겨보세요!
              </div>
            ) : (
              <div className="space-y-2">
                {comments.map((c) => (
                  <div key={c.id}>
                    {/* ── 원 댓글 ── */}
                    <div className="rounded-lg border border-border/50 bg-card px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                            {!isAdminUserId(c.authorId) && (
                              <AuthorLevelIcon name={c.authorDisplay} size={14} />
                            )}
                            <AdminAuthorBadge
                              name={c.authorDisplay}
                              userId={c.authorId}
                              iconSize={13}
                              className="truncate"
                            />
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatTimestamp(new Date(c.createdAt))}
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          {!c.isDeleted && <DislikeButton targetType="board_comment" targetId={c.id} canDislike={canComment} />}
                          {canComment && !c.isDeleted && (
                            <button
                              type="button"
                              className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground/60 hover:text-chart-5 hover:bg-chart-5/10 transition-colors"
                              onClick={() => setReplyingToId(replyingToId === c.id ? null : c.id)}
                              title="답글"
                            >
                              <CornerDownRight className="size-3.5" />
                            </button>
                          )}
                          {!c.isDeleted && <ReportButton targetType="board_comment" targetId={c.id} canReport={canComment} />}
                          {!c.isDeleted && currentUserId && (c.authorId === currentUserId || isAdminUserId(currentUserId)) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-muted-foreground hover:text-destructive h-7 px-1.5"
                              onClick={() => handleDeleteComment(c.id)}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                      {c.isDeleted ? (
                        <div className="mt-2 text-sm text-muted-foreground italic">삭제된 댓글입니다.</div>
                      ) : (
                        <div className="mt-2 text-sm whitespace-pre-wrap text-foreground">
                          {c.content}
                        </div>
                      )}

                      {/* 대댓글 작성 폼 */}
                      {replyingToId === c.id && (
                        <div className="mt-3 pt-3 border-t border-border/40 space-y-2">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <CornerDownRight className="size-3" />
                            <span>{c.authorDisplay}에게 답글</span>
                          </div>
                          <Textarea
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder="답글을 입력하세요 (Ctrl+Enter 로 등록)"
                            className="min-h-16 text-sm"
                            disabled={isSubmittingComment}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                                e.preventDefault();
                                void handleSubmitReply(c.id);
                              }
                            }}
                            autoFocus
                          />
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => { setReplyingToId(null); setReplyText(""); }}
                              disabled={isSubmittingComment}
                            >
                              취소
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => handleSubmitReply(c.id)}
                              disabled={!replyText.trim() || isSubmittingComment}
                            >
                              {isSubmittingComment ? <Loader2 className="size-3.5 animate-spin" /> : "등록"}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* ── 대댓글 목록 ── */}
                    {(c.replies ?? []).length > 0 && (
                      <div className="ml-6 mt-1 space-y-1.5">
                        {(c.replies ?? []).map((reply) => (
                          <div key={reply.id} className="rounded-lg border border-border/40 bg-secondary/10 px-4 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                                  <CornerDownRight className="size-3 text-muted-foreground/50 shrink-0" />
                                  {!isAdminUserId(reply.authorId) && (
                                    <AuthorLevelIcon name={reply.authorDisplay} size={13} />
                                  )}
                                  <AdminAuthorBadge
                                    name={reply.authorDisplay}
                                    userId={reply.authorId}
                                    iconSize={12}
                                    className="truncate"
                                  />
                                </div>
                                <div className="text-xs text-muted-foreground pl-4">
                                  {formatTimestamp(new Date(reply.createdAt))}
                                </div>
                              </div>
                              <div className="flex items-center gap-0.5 shrink-0">
                                {!reply.isDeleted && <DislikeButton targetType="board_comment" targetId={reply.id} canDislike={canComment} />}
                                {!reply.isDeleted && <ReportButton targetType="board_comment" targetId={reply.id} canReport={canComment} />}
                                {!reply.isDeleted && currentUserId && (reply.authorId === currentUserId || isAdminUserId(currentUserId)) && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-muted-foreground hover:text-destructive h-7 px-1.5"
                                    onClick={() => handleDeleteComment(reply.id, c.id)}
                                  >
                                    <Trash2 className="size-3.5" />
                                  </Button>
                                )}
                              </div>
                            </div>
                            {reply.isDeleted ? (
                              <div className="mt-2 text-sm text-muted-foreground italic pl-4">삭제된 댓글입니다.</div>
                            ) : (
                              <div className="mt-2 text-sm whitespace-pre-wrap text-foreground pl-4">
                                {reply.content}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* 댓글 목록 하단 광고 */}
            {comments.length > 0 && (
              <AdSlot
                slot={AD_COMMENT_SLOT}
                format="rectangle"
                className="my-2"
                label="스폰서 광고"
              />
            )}

            <div className="rounded-xl border border-border/50 bg-card p-4">
              {!canComment ? (
                <div className="text-sm text-muted-foreground">
                  댓글을 달려면 로그인해주세요.
                </div>
              ) : (
                <div className="space-y-2">
                  <Label>댓글 작성</Label>
                  <Textarea
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                        e.preventDefault();
                        void handleSubmitComment();
                      }
                    }}
                    placeholder="댓글을 입력하세요 (Ctrl+Enter 로 등록)"
                    className="min-h-24"
                    disabled={isSubmittingComment}
                  />
                  <div className="flex justify-end">
                    <Button
                      onClick={handleSubmitComment}
                      disabled={!commentText.trim() || isSubmittingComment}
                    >
                      {isSubmittingComment ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          등록 중...
                        </>
                      ) : (
                        "등록"
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
