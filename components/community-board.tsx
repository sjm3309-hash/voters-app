"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Clock, Eye, Flame, Heart, Loader2, MessageSquare, PenLine, Tag } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FilterId } from "@/components/category-filter";
import {
  boardCategoryFromFilter,
  HOT_SCORE_THRESHOLD,
  loadBoardPosts,
  postTrendingScore,
  saveBoardPosts,
  type BoardPost,
} from "@/lib/board";
import { loadAuthUser } from "@/lib/auth";
import { loadComments, type Comment } from "@/lib/comments";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getLikeCount, hasLiked, toggleLike } from "@/lib/likes";
import { AuthorLevelIcon } from "@/components/level-icon";
import { AdminAuthorBadge } from "@/components/admin-author-badge";
import { isAdminUserId } from "@/lib/admin";
import { BoardPagination } from "@/components/board-pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getBoardMainTitle, getBoardSubTabLine } from "@/lib/board-tab-labels";

const PAGE_SIZE = 10;

interface CommunityBoardProps {
  activeFilter?: FilterId;
  /** 홈 상단 카테고리 세부 탭 선택값 (예: 국내야구 → baseball_kr) */
  activeSubTabId?: string;
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
  { value: "sports",   label: "⚽ 스포츠" },
  { value: "fun",      label: "😄 재미" },
  { value: "stocks",   label: "📈 주식" },
  { value: "crypto",   label: "🪙 크립토" },
  { value: "politics", label: "🏛️ 정치" },
  { value: "game",     label: "🎮 게임" },
] as const;

const categoryLabel: Record<(typeof categoryOptions)[number]["value"], string> = {
  sports:   "⚽ 스포츠",
  fun:      "😄 재미",
  stocks:   "📈 주식",
  crypto:   "🪙 크립토",
  politics: "🏛️ 정치",
  game:     "🎮 게임",
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

  const comments = post.commentCount ?? 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className="group w-full border-b border-gray-100 bg-background text-left transition-colors last:border-b-0 hover:bg-gray-50/80 dark:border-border/40 dark:bg-background dark:hover:bg-muted/25"
    >
      <div className="flex items-start gap-1.5 px-2.5 py-[0.64rem] sm:gap-2 sm:px-4">
        <div className="size-7 shrink-0 overflow-hidden rounded-md bg-secondary sm:size-8">
          {thumb ? (
            <img src={thumb} alt="" className="size-full object-cover" />
          ) : (
            <div className="flex size-full items-center justify-center bg-gradient-to-br from-secondary to-muted">
              <MessageSquare className="size-[0.875rem] text-muted-foreground sm:size-4" />
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <span className="block min-w-0 text-[calc(1.0625rem-1pt)] font-medium leading-tight text-foreground group-hover:text-neon-blue">
            {post.isHot && (
              <Flame
                className="inline-block size-3 shrink-0 align-[-0.15em] mr-0.5 text-neon-red sm:size-3.5"
                aria-hidden
              />
            )}
            <span className="break-words">{post.title}</span>
            <span className="whitespace-nowrap text-[0.9375rem] font-medium tabular-nums text-blue-500 dark:text-blue-400">
              {" "}
              [{comments}]
            </span>
          </span>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-px text-[13px] leading-tight text-muted-foreground">
            <span className="inline-flex items-center gap-1 min-w-0">
              {!isAdminUserId(post.authorId) && (
                <AuthorLevelIcon name={post.author} size={12} />
              )}
              <AdminAuthorBadge
                name={post.author}
                userId={post.authorId}
                iconSize={12}
                className="truncate"
              />
            </span>
            <span className="text-muted-foreground/50" aria-hidden>
              ·
            </span>
            <span>{formatTimestamp(toDate(post.createdAt))}</span>
            <span className="text-muted-foreground/50" aria-hidden>
              ·
            </span>
            <span className="inline-flex items-center gap-0.5">
              <Tag className="size-3 shrink-0 opacity-70" aria-hidden />
              {categoryLabel[post.category]}
            </span>
            <span className="text-muted-foreground/50" aria-hidden>
              ·
            </span>
            <span className="inline-flex items-center gap-0.5 tabular-nums">
              <Eye className="size-3 shrink-0 opacity-70" aria-hidden />
              {post.views ?? 0}
            </span>
            <span className="text-muted-foreground/50" aria-hidden>
              ·
            </span>
            <span
              role="button"
              tabIndex={0}
              className={cn(
                "inline-flex items-center gap-0.5 rounded-md tabular-nums transition-colors",
                liked ? "text-neon-red" : "hover:text-foreground",
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
              <Heart
                className={cn(
                  "size-3 shrink-0 opacity-70",
                  liked ? "fill-current text-neon-red opacity-100" : "",
                )}
              />
              {likeCount}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}

export function CommunityBoard({
  activeFilter,
  activeSubTabId,
  searchQuery,
  className,
}: CommunityBoardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const pageFromUrl = useMemo(() => {
    const raw = searchParams.get("page");
    const n = parseInt(raw ?? "1", 10);
    if (!Number.isFinite(n) || n < 1) return 1;
    return n;
  }, [searchParams]);

  /** 목록으로 돌아갈 때 복원할 전체 경로 (?tab · page 등 포함) */
  const listReturnUrl = useMemo(
    () => `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`,
    [pathname, searchParams],
  );

  const setUrlPage = useCallback(
    (next: number) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next <= 1) params.delete("page");
      else params.set("page", String(next));
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const [localPosts, setLocalPosts] = useState<BoardPost[]>([]);
  const [activeTab, setActiveTab] = useState<"hot" | "recent">("recent");
  const [comments, setComments] = useState<Comment[]>([]);

  const [searchMode, setSearchMode] = useState<"title" | "title_content" | "comments" | "author">(
    "title_content",
  );
  const [advancedQuery, setAdvancedQuery] = useState("");

  const [useRemote, setUseRemote] = useState(false);
  const [remotePosts, setRemotePosts] = useState<BoardPost[]>([]);
  const [remoteTotalPages, setRemoteTotalPages] = useState(0);
  const [remoteLoading, setRemoteLoading] = useState(true);
  const [initialFetchDone, setInitialFetchDone] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    const onPosts = () => setRefreshTick((t) => t + 1);
    window.addEventListener("voters:postsUpdated", onPosts);
    return () => window.removeEventListener("voters:postsUpdated", onPosts);
  }, []);

  useEffect(() => {
    const load = () => {
      const stored = loadBoardPosts();
      setLocalPosts(stored);
    };

    load();
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

  const combinedSearch = (advancedQuery.trim() || searchQuery?.trim() || "").trim();

  const sortMode =
    activeFilter === "popular"
      ? "hot"
      : activeFilter === "recent"
        ? "recent"
        : activeTab;

  const derivedList = useMemo(() => {
    const base = filterCategory ? localPosts.filter((p) => p.category === filterCategory) : localPosts;
    const q = combinedSearch.toLowerCase();
    const filtered = q
      ? base.filter((p) => {
          if (searchMode === "title") return p.title.toLowerCase().includes(q);
          if (searchMode === "title_content")
            return `${p.title}\n${p.content}`.toLowerCase().includes(q);
          if (searchMode === "author") return p.author.toLowerCase().includes(q);
          const list = commentsByPostId.get(p.id) ?? [];
          return list.some(
            (c) => c.content.toLowerCase().includes(q) || c.author.toLowerCase().includes(q),
          );
        })
      : base;

    if (sortMode === "hot") {
      const scored = filtered.map((p) => ({
        post: p,
        score: postTrendingScore(p, getLikeCount({ type: "post", id: p.id })),
      }));

      const hotPosts = scored
        .filter(({ score }) => score >= HOT_SCORE_THRESHOLD)
        .sort((a, b) => toDate(b.post.createdAt).getTime() - toDate(a.post.createdAt).getTime())
        .map(({ post }) => post);

      if (hotPosts.length > 0) return hotPosts;

      return scored.sort((a, b) => b.score - a.score).map(({ post }) => post);
    }

    return [...filtered].sort(
      (a, b) => toDate(b.createdAt).getTime() - toDate(a.createdAt).getTime(),
    );
  }, [
    activeFilter,
    activeTab,
    combinedSearch,
    commentsByPostId,
    filterCategory,
    localPosts,
    searchMode,
    sortMode,
  ]);

  const sortApiParam = sortMode === "hot" ? "hot" : "recent";

  const fetchParamsRef = useRef({
    pageFromUrl,
    sortApiParam,
    filterCategory,
    combinedSearch,
  });
  fetchParamsRef.current = { pageFromUrl, sortApiParam, filterCategory, combinedSearch };

  const applyRemoteJson = useCallback(
    (
      res: Response,
      j: {
        ok?: boolean;
        posts?: BoardPost[];
        totalPages?: number;
        count?: number;
      },
      qLen: number,
      opts?: { soft?: boolean },
    ) => {
      if (!res.ok || !j?.ok || !Array.isArray(j.posts)) {
        if (!opts?.soft) setUseRemote(false);
        return;
      }

      const count = typeof j.count === "number" ? j.count : 0;
      let tp = typeof j.totalPages === "number" ? j.totalPages : 0;
      /** count만 오고 totalPages가 빠진 응답 보정 */
      if (count > 0 && tp === 0) {
        tp = Math.max(1, Math.ceil(count / PAGE_SIZE));
      }
      /** 글 목록은 있는데 count/totalPages가 0으로 온 경우(구 클라이언트 등) 최소 1페이지 */
      if (j.posts.length > 0 && tp === 0 && count === 0) {
        tp = 1;
      }

      /** 관리자/일반 유저 동일: 서버에 맞는 목록이 오면 무조건 원격 모드 (count 표기 누락에도 목록 기준 처리) */
      if (count > 0 || qLen > 0 || j.posts.length > 0 || tp > 0) {
        setUseRemote(true);
        setRemotePosts(j.posts);
        setRemoteTotalPages(tp);
        return;
      }

      // 서버 응답이 정상이면 항상 remote 모드 사용 (localStorage mock 폴백 금지)
      setUseRemote(true);
      setRemotePosts([]);
      setRemoteTotalPages(0);
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    async function run() {
      setRemoteLoading(true);
      try {
        const params = new URLSearchParams();
        params.set("page", String(pageFromUrl));
        params.set("limit", String(PAGE_SIZE));
        params.set("sort", sortApiParam);
        if (filterCategory) params.set("category", filterCategory);
        if (combinedSearch.length > 0) params.set("q", combinedSearch);

        const res = await fetch(`/api/board-posts?${params.toString()}`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          posts?: BoardPost[];
          totalPages?: number;
          count?: number;
        };

        if (cancelled) return;

        applyRemoteJson(res, j, combinedSearch.length);
      } catch {
        if (!cancelled) setUseRemote(false);
      } finally {
        if (!cancelled) {
          setRemoteLoading(false);
          setInitialFetchDone(true);
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [applyRemoteJson, combinedSearch.length, filterCategory, pageFromUrl, sortApiParam]);

  useEffect(() => {
    if (refreshTick === 0) return;
    let cancelled = false;

    async function run() {
      const { pageFromUrl: p, sortApiParam: s, filterCategory: fc, combinedSearch: cs } =
        fetchParamsRef.current;
      try {
        const params = new URLSearchParams();
        params.set("page", String(p));
        params.set("limit", String(PAGE_SIZE));
        params.set("sort", s);
        if (fc) params.set("category", fc);
        if (cs.length > 0) params.set("q", cs);

        const res = await fetch(`/api/board-posts?${params.toString()}`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          posts?: BoardPost[];
          totalPages?: number;
          count?: number;
        };

        if (cancelled) return;

        applyRemoteJson(res, j, cs.length, { soft: true });
      } catch {
        /* silent refresh: keep previous list */
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, [applyRemoteJson, refreshTick]);

  const withMergedComments = useCallback(
    (post: BoardPost): BoardPost => {
      const n = commentsByPostId.get(post.id)?.length ?? 0;
      return { ...post, commentCount: Math.max(post.commentCount ?? 0, n) };
    },
    [commentsByPostId],
  );

  const localTotalPages = Math.max(1, Math.ceil(derivedList.length / PAGE_SIZE));

  const displayPosts = useMemo(() => {
    if (useRemote && initialFetchDone && !remoteLoading) {
      return remotePosts.map(withMergedComments);
    }
    if (!useRemote && initialFetchDone) {
      const start = (pageFromUrl - 1) * PAGE_SIZE;
      return derivedList.slice(start, start + PAGE_SIZE).map(withMergedComments);
    }
    return [];
  }, [
    derivedList,
    initialFetchDone,
    pageFromUrl,
    remoteLoading,
    remotePosts,
    useRemote,
    withMergedComments,
  ]);

  const effectiveTotalPages = useRemote ? remoteTotalPages : derivedList.length === 0 ? 0 : localTotalPages;

  /** 페이지네이션은 권한과 무관하게 동일 규칙. 글이 있으면 최소 1페이지로 표시(개발·단일 페이지 확인용) */
  const paginationTotalPages = useMemo(() => {
    if (displayPosts.length === 0) return 0;
    const base = useRemote ? remoteTotalPages : effectiveTotalPages;
    if (useRemote && base === 0 && displayPosts.length > 0) return 1;
    return Math.max(base, 1);
  }, [displayPosts.length, effectiveTotalPages, remoteTotalPages, useRemote]);

  useEffect(() => {
    if (!initialFetchDone || remoteLoading) return;

    const params = new URLSearchParams(searchParams.toString());

    if (pageFromUrl > 1 && effectiveTotalPages <= 0) {
      params.delete("page");
      router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname, { scroll: false });
      return;
    }

    if (effectiveTotalPages > 0 && pageFromUrl > effectiveTotalPages) {
      params.delete("page");
      router.replace(params.toString() ? `${pathname}?${params.toString()}` : pathname, { scroll: false });
    }
  }, [
    effectiveTotalPages,
    initialFetchDone,
    pageFromUrl,
    pathname,
    remoteLoading,
    router,
    searchParams,
  ]);

  const activeCategoryParam = boardCategoryFromFilter(activeFilter ?? "recent");

  const boardMainTitle = useMemo(() => getBoardMainTitle(activeFilter), [activeFilter]);

  const boardSubTabLine = useMemo(
    () => getBoardSubTabLine(activeFilter ?? null, activeSubTabId ?? null),
    [activeFilter, activeSubTabId],
  );

  const emptyMessage =
    useRemote && initialFetchDone && !remoteLoading && remotePosts.length === 0
      ? combinedSearch.length > 0
        ? "검색 결과가 없습니다"
        : "게시글이 없습니다"
      : null;

  const showSpinner = !initialFetchDone || remoteLoading;

  return (
    <div
      className={cn(
        "flex flex-col h-full bg-card rounded-xl border border-border/50",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-border/50">
        <div className="flex min-w-0 flex-1 gap-2.5">
          <Flame className="size-5 shrink-0 text-neon-red mt-0.5" aria-hidden />
          <div className="min-w-0 flex-1 space-y-1 pr-2">
            <h1 className="text-base sm:text-lg font-semibold text-foreground leading-snug truncate">
              {boardMainTitle}
            </h1>
            {boardSubTabLine ? (
              <p className="text-[calc(0.875rem-2pt)] text-muted-foreground mt-1 leading-snug">
                {boardSubTabLine}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          {activeFilter !== "popular" && activeFilter !== "recent" && (
            <div className="flex items-center gap-1 bg-secondary/50 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setActiveTab("hot")}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                  activeTab === "hot"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Flame className="size-3" />
                인기
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("recent")}
                className={cn(
                  "flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors",
                  activeTab === "recent"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
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
              const p = new URLSearchParams();
              if (activeCategoryParam) p.set("category", activeCategoryParam);
              p.set("next", listReturnUrl);
              router.push(`/board/write?${p.toString()}`);
            }}
            className="hidden sm:inline-flex"
          >
            <PenLine className="size-4" />
            글쓰기
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-1 py-1 min-h-0">
        {showSpinner ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16">
            <Loader2 className="size-8 animate-spin text-chart-5" aria-hidden />
            <p className="text-sm text-muted-foreground">게시글을 불러오는 중...</p>
          </div>
        ) : displayPosts.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center p-4 min-h-[200px]">
            <div className="size-12 rounded-full bg-secondary flex items-center justify-center mb-3">
              <MessageSquare className="size-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              {emptyMessage ?? "아직 게시글이 없습니다"}
            </p>
            {!emptyMessage && combinedSearch.length === 0 && (
              <p className="text-xs text-muted-foreground mt-1">첫 번째로 의견을 남겨보세요!</p>
            )}
          </div>
        ) : (
          <div className="px-2 sm:px-3">
            {displayPosts.map((post) => (
              <PostItem
                key={post.id}
                post={post}
                onClick={() => {
                  const p = new URLSearchParams();
                  p.set("next", listReturnUrl);
                  router.push(`/board/${post.id}?${p.toString()}`);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {!showSpinner && displayPosts.length > 0 && paginationTotalPages >= 1 && (
        <BoardPagination
          page={pageFromUrl}
          totalPages={paginationTotalPages}
          onPageChange={setUrlPage}
        />
      )}

      <div className="px-4 py-3 border-t border-border/50">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <Select value={searchMode} onValueChange={(v) => setSearchMode(v as typeof searchMode)}>
            <SelectTrigger className="w-full sm:w-[140px] shrink-0" size="sm">
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
            className="h-9 min-w-0"
          />
        </div>
      </div>
    </div>
  );
}
