"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Clock, Eye, Flame, Heart, MessageSquare, PenLine, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FilterId } from "@/components/category-filter";
import { boardCategoryFromFilter, HOT_SCORE_THRESHOLD, loadBoardPosts, postTrendingScore, saveBoardPosts, type BoardPost } from "@/lib/board";
import { mockCommunityPosts } from "@/lib/mock-community-posts";
import { loadAuthUser } from "@/lib/auth";
import { loadComments, type Comment } from "@/lib/comments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getLikeCount, hasLiked, toggleLike } from "@/lib/likes";
import { AuthorLevelIcon } from "@/components/level-icon";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CommunityBoardProps {
  activeFilter?: FilterId;
  searchQuery?: string;
  className?: string;
}

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

const categoryOptions = [
  { value: "sports", label: "스포츠" },
  { value: "fun", label: "재미" },
  { value: "stocks", label: "주식" },
  { value: "crypto", label: "크립토" },
  { value: "politics", label: "정치" },
  { value: "game", label: "게임" },
  { value: "suggest", label: "건의" },
] as const;

const categoryLabel: Record<(typeof categoryOptions)[number]["value"], string> = {
  sports: "스포츠",
  fun: "재미",
  stocks: "주식",
  crypto: "크립토",
  politics: "정치",
  game: "게임",
  suggest: "건의",
};

function toDate(createdAt: string) {
  const d = new Date(createdAt);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}

function PostItem({
  post,
  onClick,
}: {
  post: BoardPost;
  onClick?: () => void;
}) {
  const thumb = post.thumbnail || post.images?.[0];
  const userId = loadAuthUser()?.name?.trim() || "anon";
  const target = useMemo(() => ({ type: "post" as const, id: post.id }), [post.id]);
  const [likeCount, setLikeCount] = useState<number>(0);
  const [liked, setLiked] = useState<boolean>(false);

  useEffect(() => {
    setLikeCount(getLikeCount(target));
    setLiked(hasLiked(target, userId));
  }, [target, userId]);

  useEffect(() => {
    const onLikesUpdated = () => {
      setLikeCount(getLikeCount(target));
      setLiked(hasLiked(target, userId));
    };
    window.addEventListener("voters:likesUpdated", onLikesUpdated as EventListener);
    window.addEventListener("storage", onLikesUpdated as EventListener);
    return () => {
      window.removeEventListener("voters:likesUpdated", onLikesUpdated as EventListener);
      window.removeEventListener("storage", onLikesUpdated as EventListener);
    };
  }, [target, userId]);

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-secondary/70 transition-colors rounded-lg group text-left"
    >
      {/* 40x40 Rounded Thumbnail */}
      <div className="size-10 rounded-lg bg-secondary overflow-hidden shrink-0">
        {thumb ? (
          <img
            src={thumb}
            alt=""
            className="size-full object-cover"
          />
        ) : (
          <div className="size-full flex items-center justify-center bg-gradient-to-br from-secondary to-muted">
            <MessageSquare className="size-4 text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Title and Comment Count */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          {post.isHot && (
            <Flame className="size-3.5 text-neon-red shrink-0" />
          )}
          <span className="text-sm font-medium text-foreground truncate group-hover:text-neon-blue transition-colors">
            {post.title}
          </span>
          <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-muted-foreground shrink-0">
            <Tag className="size-3" />
            {categoryLabel[post.category]}
          </span>
          {/* commentCount는 우측 메타에 표시 */}
        </div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <AuthorLevelIcon name={post.author} size={12} />
          <span className="text-xs text-muted-foreground truncate">
            {post.author}
          </span>
          <span className="text-xs text-muted-foreground/60">·</span>
          <span className="text-xs text-muted-foreground/60">
            {formatTimestamp(toDate(post.createdAt))}
          </span>
        </div>
      </div>

      {/* Meta + Arrow */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span className="hidden sm:inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground">
          <Eye className="size-3.5" />
          <span>{post.views ?? 0}</span>
        </span>
        <span className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground">
          <MessageSquare className="size-3.5" />
          <span>{post.commentCount ?? 0}</span>
        </span>
        <span
          role="button"
          tabIndex={0}
          className={cn(
            "inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] transition-colors",
            liked ? "bg-neon-red/10 text-neon-red" : "text-muted-foreground hover:bg-secondary"
          )}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const next = toggleLike(target, userId);
            setLikeCount(next.count);
            setLiked(next.liked);
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter" && e.key !== " ") return;
            e.preventDefault();
            e.stopPropagation();
            const next = toggleLike(target, userId);
            setLikeCount(next.count);
            setLiked(next.liked);
          }}
          aria-label="좋아요"
        >
          <Heart className={cn("size-3.5", liked ? "fill-current" : "")} />
          <span>{likeCount}</span>
        </span>
        <ChevronRight className="size-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </button>
  );
}

export function CommunityBoard({
  activeFilter,
  searchQuery,
  className,
}: CommunityBoardProps) {
  const router = useRouter();
  const [posts, setPosts] = useState<BoardPost[]>([]);
  const [activeTab, setActiveTab] = useState<"hot" | "recent">("recent");
  const [comments, setComments] = useState<Comment[]>([]);

  const [searchMode, setSearchMode] = useState<"title" | "title_content" | "comments" | "author">(
    "title_content"
  );
  const [advancedQuery, setAdvancedQuery] = useState("");

  useEffect(() => {
    const load = () => {
      const stored = loadBoardPosts();
      if (stored.length > 0) {
        setPosts(stored);
        return;
      }
      const seeded: BoardPost[] = mockCommunityPosts.map((p) => ({
        id: p.id,
        title: p.title,
        content: p.content,
        category: p.category,
        thumbnail: p.thumbnail,
        images: p.thumbnail ? [p.thumbnail] : [],
        commentCount: p.commentCount,
        author: p.author,
        createdAt: p.timestamp.toISOString(),
        isHot: p.isHot,
      }));
      setPosts(seeded);
      saveBoardPosts(seeded);
    };

    load();

    // 글 작성/삭제 시 목록 즉시 갱신
    window.addEventListener("voters:postsUpdated", load);
    window.addEventListener("voters:postViewsUpdated", load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener("voters:postsUpdated", load);
      window.removeEventListener("voters:postViewsUpdated", load);
      window.removeEventListener("storage", load);
    };
  }, []);

  useEffect(() => {
    setComments(loadComments());
    const onCommentsUpdated = () => setComments(loadComments());
    window.addEventListener("voters:commentsUpdated", onCommentsUpdated as EventListener);
    return () => window.removeEventListener("voters:commentsUpdated", onCommentsUpdated as EventListener);
  }, []);

  const filterCategory = activeFilter ? boardCategoryFromFilter(activeFilter) : null;

  const commentsByPostId = useMemo(() => {
    const map = new Map<string, Comment[]>();
    for (const c of comments) {
      const list = map.get(c.postId);
      if (list) list.push(c);
      else map.set(c.postId, [c]);
    }
    return map;
  }, [comments]);

  const visiblePosts = useMemo(() => {
    const base = filterCategory ? posts.filter((p) => p.category === filterCategory) : posts;
    const sortMode =
      activeFilter === "popular" ? "hot" : activeFilter === "recent" ? "recent" : activeTab;

    const q = (advancedQuery.trim() || searchQuery?.trim() || "").toLowerCase();
    const filtered = q
      ? base.filter((p) => {
          if (searchMode === "title") return p.title.toLowerCase().includes(q);
          if (searchMode === "title_content")
            return `${p.title}\n${p.content}`.toLowerCase().includes(q);
          if (searchMode === "author") return p.author.toLowerCase().includes(q);
          const list = commentsByPostId.get(p.id) ?? [];
          return list.some(
            (c) =>
              c.content.toLowerCase().includes(q) || c.author.toLowerCase().includes(q)
          );
        })
      : base;

    if (sortMode === "hot") {
      const scored = filtered.map((p) => ({
        post: p,
        score: postTrendingScore(p, getLikeCount({ type: "post", id: p.id })),
      }));

      // 10,000점 이상인 글 → 최신순
      const hotPosts = scored
        .filter(({ score }) => score >= HOT_SCORE_THRESHOLD)
        .sort((a, b) =>
          toDate(b.post.createdAt).getTime() - toDate(a.post.createdAt).getTime(),
        )
        .map(({ post }) => post);

      if (hotPosts.length > 0) return hotPosts;

      // 기준 미달 시 전체 글을 점수 높은 순으로 표시
      return scored
        .sort((a, b) => b.score - a.score)
        .map(({ post }) => post);
    }

    const sorted = [...filtered].sort(
      (a, b) => toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime(),
    );
    return sorted;
  }, [activeFilter, activeTab, advancedQuery, commentsByPostId, filterCategory, posts, searchMode, searchQuery]);

  const activeCategoryParam = boardCategoryFromFilter(activeFilter ?? "recent");

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-card rounded-xl border border-border/50",
        className
      )}
    >
      {/* Header with Tabs */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="flex items-center gap-2">
          <Flame className="size-5 text-neon-red" />
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground truncate">게시판</h3>
            {filterCategory && (
              <p className="text-xs text-muted-foreground">
                {categoryLabel[filterCategory]} 탭 글만 표시 중
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {activeFilter !== "popular" && activeFilter !== "recent" && (
            <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-0.5">
              <button
                onClick={() => setActiveTab("hot")}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                  activeTab === "hot"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Flame className="size-3" />
                인기
              </button>
              <button
                onClick={() => setActiveTab("recent")}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                  activeTab === "recent"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Clock className="size-3" />
                최신
              </button>
            </div>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const qs = activeCategoryParam ? `?category=${activeCategoryParam}` : "";
              router.push(`/board/write${qs}`);
            }}
            className="hidden sm:inline-flex"
          >
            <PenLine className="size-4" />
            글쓰기
          </Button>
        </div>
      </div>

      {/* Post List */}
      <div className="flex-1 overflow-y-auto px-1 py-1 min-h-0">
        {visiblePosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4">
            <div className="size-12 rounded-full bg-secondary flex items-center justify-center mb-3">
              <MessageSquare className="size-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">아직 게시글이 없습니다</p>
            <p className="text-xs text-muted-foreground mt-1">첫 번째로 의견을 남겨보세요!</p>
          </div>
        ) : (
          <div className="space-y-0.5">
            {visiblePosts.map((post) => (
              <PostItem
                key={post.id}
                post={post}
                onClick={() => {
                  router.push(`/board/${post.id}`);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border/50">
        <div className="flex items-center gap-2">
          <Select value={searchMode} onValueChange={(v) => setSearchMode(v as any)}>
            <SelectTrigger className="w-[140px]" size="sm">
              <SelectValue placeholder="검색 조건" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="title">제목</SelectItem>
              <SelectItem value="title_content">제목+내용</SelectItem>
              <SelectItem value="comments">댓글</SelectItem>
              <SelectItem value="author">아이디</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={advancedQuery}
            onChange={(e) => setAdvancedQuery(e.target.value)}
            placeholder="게시판 상세 검색"
            className="h-9"
          />
        </div>
      </div>
    </div>
  );
}
