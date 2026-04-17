"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Eye, Heart, MessageSquare, Pencil, Tag, Trash2 } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { incrementPostViews, loadBoardPosts, saveBoardPosts, type BoardPost } from "@/lib/board";
import { addComment, deleteCommentsByPostId, getCommentsForPost, type Comment } from "@/lib/comments";
import { getLikeCount, hasLiked, toggleLike } from "@/lib/likes";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { useUserPointsBalance } from "@/lib/points";
import { checkAndGrantCommentReward, checkAndGrantLikeReward } from "@/lib/daily-rewards";
import { createClient } from "@/utils/supabase/client";
import { AuthorLevelIcon } from "@/components/level-icon";

const categoryLabel: Record<BoardPost["category"], string> = {
  sports: "스포츠",
  fun: "재미",
  stocks: "주식",
  crypto: "크립토",
  politics: "정치",
  game: "게임",
  suggest: "건의",
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
  const params = useParams();
  const id = params.id as string;

  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");

  useEffect(() => {
    const sync = () => {
      const p = loadBoardPosts();
      setPosts(p);
      setLoaded(true);
    };
    sync();
    // 최초 진입 시 조회수 +1 (이벤트 없이 직접 저장)
    incrementPostViews(id);
    sync();
    window.addEventListener("voters:postsUpdated", sync as EventListener);
    window.addEventListener("voters:postViewsUpdated", sync as EventListener);
    window.addEventListener("storage", sync as EventListener);
    return () => {
      window.removeEventListener("voters:postsUpdated", sync as EventListener);
      window.removeEventListener("voters:postViewsUpdated", sync as EventListener);
      window.removeEventListener("storage", sync as EventListener);
    };
  }, [id]);

  // Do not auto-save on every posts state change.
  // This page also listens to `voters:postsUpdated`, and auto-saving here can cause
  // an update loop with other listeners (e.g., Navbar/UserCenter).

  const post = useMemo(() => posts.find((p) => p.id === id) || null, [posts, id]);

  useEffect(() => {
    if (!id) return;
    setComments(getCommentsForPost(id));
  }, [id]);

  const { userId, points: userBalance } = useUserPointsBalance();
  const canComment = userId !== "anon";
  const likeUserId = userId !== "anon" ? userId : "anon";
  const likeTarget = useMemo(() => ({ type: "post" as const, id }), [id]);
  const [likeCount, setLikeCount] = useState<number>(0);
  const [liked, setLiked] = useState<boolean>(false);

  // 현재 로그인 유저의 display name (Supabase)
  const [currentDisplayName, setCurrentDisplayName] = useState<string>("");
  useEffect(() => {
    createClient().auth.getSession().then(({ data: { session } }) => {
      const u = session?.user;
      if (!u) return;
      const name =
        u.user_metadata?.nickname ??
        u.user_metadata?.full_name ??
        u.user_metadata?.name ??
        u.email?.split("@")[0] ?? "";
      setCurrentDisplayName(name);
    });
  }, [userId]);

  // 글 관리 권한: 작성자 본인만
  const canManage = !!post && !!currentDisplayName && post.author === currentDisplayName;

  useEffect(() => {
    setLikeCount(getLikeCount(likeTarget));
    setLiked(hasLiked(likeTarget, likeUserId));
  }, [likeTarget, likeUserId]);

  useEffect(() => {
    const onLikesUpdated = () => {
      const newCount = getLikeCount(likeTarget);
      setLikeCount(newCount);
      setLiked(hasLiked(likeTarget, likeUserId));
      // 내 글에 좋아요가 쌓이면 보상 체크
      if (post && userId && userId !== "anon" && post.author === currentDisplayName) {
        checkAndGrantLikeReward(userId, post.id, newCount);
      }
    };
    window.addEventListener("voters:likesUpdated", onLikesUpdated as EventListener);
    window.addEventListener("storage", onLikesUpdated as EventListener);
    return () => {
      window.removeEventListener("voters:likesUpdated", onLikesUpdated as EventListener);
      window.removeEventListener("storage", onLikesUpdated as EventListener);
    };
  }, [likeTarget, likeUserId, post, userId, currentDisplayName]);

  useEffect(() => {
    if (!post) return;
    if (!isEditing) return;
    setEditTitle(post.title);
    setEditContent(post.content);
  }, [isEditing, post]);

  if (!loaded) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar balance={userBalance} userId={userId} />
        <main className="px-4 md:px-6 py-10">
          <Button variant="ghost" onClick={() => router.push("/")} className="-ml-2">
            <ArrowLeft className="size-4" />
            돌아가기
          </Button>
          <div className="mt-6 text-muted-foreground">
            게시글을 불러오는 중입니다.
          </div>
        </main>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar balance={userBalance} userId={userId} />
        <main className="px-4 md:px-6 py-10">
          <Button variant="ghost" onClick={() => router.push("/")} className="-ml-2">
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
        <Button variant="ghost" onClick={() => router.push("/")} className="-ml-2 mb-4">
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
                <AuthorLevelIcon name={post.author} size={14} />
                <span className="font-medium text-foreground">{post.author}</span>
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
                    onClick={() => {
                      const ok = window.confirm("정말로 이 게시글을 삭제할까요? 댓글도 함께 삭제됩니다.");
                      if (!ok) return;
                      deleteCommentsByPostId(id);
                      const next = posts.filter((p) => p.id !== id);
                      saveBoardPosts(next);
                      setPosts(next);
                      router.push("/");
                    }}
                  >
                    <Trash2 className="size-4" />
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
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsEditing(false);
                    }}
                  >
                    취소
                  </Button>
                  <Button
                    onClick={() => {
                      const t = editTitle.trim();
                      const c = editContent.trim();
                      if (!t || !c) return;
                      const next = posts.map((p) => (p.id === id ? { ...p, title: t, content: c } : p));
                      saveBoardPosts(next);
                      setPosts(next);
                      setIsEditing(false);
                    }}
                    disabled={!editTitle.trim() || !editContent.trim()}
                  >
                    저장
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

        <div className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-foreground">
              댓글 <span className="text-muted-foreground">({comments.length})</span>
            </h2>
          </div>
          <Separator className="my-3" />

          <div className="space-y-4">
            {comments.length === 0 ? (
              <div className="text-sm text-muted-foreground py-6 text-center">
                아직 댓글이 없습니다.
              </div>
            ) : (
              <div className="space-y-2">
                {comments.map((c) => (
                  <div key={c.id} className="rounded-lg border border-border/50 bg-card px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                          <AuthorLevelIcon name={c.author} size={14} />
                          <span className="truncate">{c.author}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatTimestamp(new Date(c.createdAt))}
                        </div>
                      </div>
                    </div>
                    <div className="mt-2 text-sm whitespace-pre-wrap text-foreground">
                      {c.content}
                    </div>
                  </div>
                ))}
              </div>
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
                    placeholder="댓글을 입력하세요"
                    className="min-h-24"
                  />
                  <div className="flex justify-end">
                    <Button
                      onClick={() => {
                        const created = addComment(id, commentText, currentDisplayName || "익명");
                        if (!created) return;
                        setCommentText("");
                        setComments(getCommentsForPost(id));
                        // 댓글 작성 보상 (100P, 하루 최대 500P)
                        checkAndGrantCommentReward(userId);

                        // bump comment count on post
                        const next = posts.map((p) =>
                          p.id === id ? { ...p, commentCount: (p.commentCount || 0) + 1 } : p
                        );
                        saveBoardPosts(next);
                        setPosts(next);
                      }}
                      disabled={!commentText.trim()}
                    >
                      등록
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

