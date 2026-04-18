"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { addMarketComment, getCommentsForMarket, type MarketComment } from "@/lib/market-comments";
import type { MarketBet } from "@/lib/market-bets";
import type { UserStakeSummary } from "@/lib/boat-comment-stakes";
import { representativeInkForNickname } from "@/lib/representative-ink";
import { hexToRgba, resolveOptionColor } from "@/lib/option-colors";
import { isUuidString } from "@/lib/is-uuid";
import { AdminAuthorBadge } from "@/components/admin-author-badge";
import { ReportButton } from "@/components/report-button";
import { DislikeButton } from "@/components/dislike-button";

export type BoatCommentOptionWire = { id: string; label: string; color: string };

type DbComment = {
  id: string;
  userId: string;
  author: string;
  content: string;
  createdAt: string;
};

// ──────────────────────────────────────────────────────────────
// Local-bet aggregation (localStorage 보트 / 서버 베팅 없는 경우)
// ──────────────────────────────────────────────────────────────

function aggregateLocalAuthorStakes(
  bets: MarketBet[],
  marketId: string,
  author: string,
): UserStakeSummary | null {
  const slice = bets.filter((b) => b.marketId === marketId && b.author === author);
  if (slice.length === 0) return null;
  const byOpt = new Map<string, number>();
  for (const b of slice) {
    const oid = String(b.optionId ?? "").trim();
    if (!oid) continue;
    const a = Math.floor(Number(b.amount));
    if (!Number.isFinite(a) || a <= 0) continue;
    byOpt.set(oid, (byOpt.get(oid) ?? 0) + a);
  }
  const entries = [...byOpt.entries()].sort((x, y) => {
    if (y[1] !== x[1]) return y[1] - x[1];
    return x[0].localeCompare(y[0]);
  });
  const representativeOptionId = entries[0]?.[0] ?? "";
  let totalAmount = 0;
  for (const v of byOpt.values()) totalAmount += v;
  if (totalAmount <= 0 || !representativeOptionId) return null;
  const stakeByOptionId: Record<string, number> = Object.fromEntries(byOpt);
  return { totalAmount, representativeOptionId, stakeByOptionId };
}

// ──────────────────────────────────────────────────────────────
// Dark-mode detection
// ──────────────────────────────────────────────────────────────

function useDarkUiFlag(): boolean {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const read = () =>
      setDark(document.documentElement.classList.contains("dark") || mq.matches);
    read();
    mq.addEventListener("change", read);
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => {
      mq.removeEventListener("change", read);
      mo.disconnect();
    };
  }, []);
  return dark;
}

// ──────────────────────────────────────────────────────────────
// Comment card (배경색 + 닉네임 색상 + 베팅 내역)
// ──────────────────────────────────────────────────────────────

function CommentCard({
  author,
  userId,
  commentId,
  createdAt,
  content,
  stake,
  resolveRepColor,
  getOptionLabel,
  canReport,
}: {
  author: string;
  userId?: string | null;
  commentId?: string;
  createdAt: string;
  content: string;
  stake: UserStakeSummary | null | undefined;
  resolveRepColor: (optionId: string) => string | undefined;
  getOptionLabel: (optionId: string) => string;
  canReport: boolean;
}) {
  const prefersDark = useDarkUiFlag();

  const repColor = stake?.representativeOptionId
    ? resolveRepColor(stake.representativeOptionId)
    : undefined;

  const ink = repColor != null ? representativeInkForNickname(repColor, prefersDark) : undefined;

  /** 카드 배경 — 대표 색상 14 % 투명도 */
  const cardBg = useMemo(() => {
    if (!repColor) return undefined;
    const rgba = hexToRgba(repColor, 0.14);
    if (rgba) return rgba;
    return `color-mix(in srgb, ${repColor} 14%, transparent)`;
  }, [repColor]);

  /** 베팅 내역 줄 (금액 큰 순, 최대 3개) */
  const betSummary = useMemo(() => {
    if (!stake?.stakeByOptionId) return null;
    const entries = Object.entries(stake.stakeByOptionId)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    if (entries.length === 0) return null;
    return entries
      .map(([oid, amt]) => `${getOptionLabel(oid)} ${amt.toLocaleString()}P`)
      .join(" · ");
  }, [stake, getOptionLabel]);

  return (
    <div
      className="rounded-lg border border-border/50 px-4 py-3 transition-colors duration-200"
      style={cardBg ? { backgroundColor: cardBg } : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
            <AdminAuthorBadge
              name={author}
              userId={userId}
              iconSize={13}
              className={cn("text-sm font-semibold", !ink && "text-foreground")}
              inkColor={ink ?? undefined}
            />
            {stake != null && stake.totalAmount > 0 && (
              <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
                ({stake.totalAmount.toLocaleString()}P)
              </span>
            )}
          </div>

          {betSummary && (
            <div className="mt-0.5 text-[11px] text-muted-foreground truncate">
              {betSummary}
            </div>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {new Date(createdAt).toLocaleString("ko-KR")}
          </span>
          {commentId && (
            <>
              <DislikeButton targetType="boat_comment" targetId={commentId} canDislike={canReport} />
              <ReportButton targetType="boat_comment" targetId={commentId} canReport={canReport} />
            </>
          )}
        </div>
      </div>

      <div className="mt-2 text-sm text-foreground whitespace-pre-wrap">{content}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Props
// ──────────────────────────────────────────────────────────────

type Props = {
  marketId: string;
  options: BoatCommentOptionWire[];
  /** UUID DB 보트 */
  supabaseMode: boolean;
  refreshStakesToken: number;
  /** 로컬 보트 전용 */
  localComments: MarketComment[];
  localBets: MarketBet[];
  onLocalAddComment: (trimmed: string) => void;
};

// ──────────────────────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────────────────────

export function BoatCommentsSection({
  marketId,
  options,
  supabaseMode,
  refreshStakesToken,
  localComments,
  localBets,
  onLocalAddComment,
}: Props) {
  const [dbComments, setDbComments] = useState<DbComment[]>([]);
  const [stakesByUserId, setStakesByUserId] = useState<Record<string, UserStakeSummary>>({});
  const [commentText, setCommentText] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [commentsNotice, setCommentsNotice] = useState<string | null>(null);
  const [offlineComments, setOfflineComments] = useState<MarketComment[]>([]);

  /** 현재 로그인 유저 정보 — 닉네임·ID 모두 필요 */
  const [currentUser, setCurrentUser] = useState<{
    id: string;
    displayName: string;
  } | null>(null);

  // ── 현재 유저 로드 ─────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const u = data?.user;
      if (!u) return;
      const displayName =
        (u.user_metadata?.nickname as string | undefined)?.trim() ||
        (u.user_metadata?.full_name as string | undefined)?.trim() ||
        (u.user_metadata?.name as string | undefined)?.trim() ||
        u.email?.split("@")[0]?.trim() ||
        u.phone?.slice(-4) ||
        "익명";
      setCurrentUser({ id: u.id, displayName });
    });
  }, []);

  // ── option helpers ─────────────────────────────────────────
  const optionIndexById = useMemo(() => {
    const m = new Map<string, number>();
    options.forEach((o, i) => m.set(o.id, i));
    return m;
  }, [options]);

  const resolveRepColor = useCallback(
    (optionId: string): string | undefined => {
      const idx = optionIndexById.get(optionId) ?? 0;
      const o = options.find((x) => x.id === optionId);
      if (!o) return undefined;
      return resolveOptionColor(o.color, idx);
    },
    [optionIndexById, options],
  );

  const getOptionLabel = useCallback(
    (optionId: string): string => {
      return options.find((o) => o.id === optionId)?.label ?? optionId;
    },
    [options],
  );

  // ── initial load ───────────────────────────────────────────
  useEffect(() => {
    if (!supabaseMode || !isUuidString(marketId)) return;
    let cancelled = false;
    setLoadError(null);
    setCommentsNotice(null);

    void (async () => {
      try {
        const res = await fetch(`/api/bets/${encodeURIComponent(marketId)}/comments`, {
          credentials: "same-origin",
          cache: "no-store",
        });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          comments?: DbComment[];
          stakesByUserId?: Record<string, UserStakeSummary>;
          error?: string;
          details?: string;
          warning?: string;
        };
        if (cancelled) return;
        if (!res.ok || !j.ok) {
          setLoadError(
            [j.details, j.error].filter(Boolean).join(" — ") || "댓글을 불러오지 못했습니다.",
          );
          setDbComments([]);
          setStakesByUserId({});
          setOfflineComments([]);
          return;
        }
        setDbComments(Array.isArray(j.comments) ? j.comments : []);
        setStakesByUserId(typeof j.stakesByUserId === "object" && j.stakesByUserId ? j.stakesByUserId : {});
        setLoadError(null);
        if (j.warning === "boat_comments_unavailable") {
          setOfflineComments(getCommentsForMarket(marketId));
          setCommentsNotice(
            "서버 댓글 테이블이 없습니다. 마이그레이션 적용 전까지 이 기기에만 저장됩니다.",
          );
        } else {
          setCommentsNotice(null);
          setOfflineComments([]);
        }
      } catch {
        if (!cancelled) setLoadError("네트워크 오류");
      }
    })();

    return () => { cancelled = true; };
  }, [marketId, supabaseMode]);

  // ── stakes refresh after betting ──────────────────────────
  useEffect(() => {
    if (!supabaseMode || !isUuidString(marketId) || refreshStakesToken <= 0) return;
    void (async () => {
      try {
        const res = await fetch(
          `/api/bets/${encodeURIComponent(marketId)}/comments?stakesOnly=1`,
          { credentials: "same-origin", cache: "no-store" },
        );
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          stakesByUserId?: Record<string, UserStakeSummary>;
        };
        if (res.ok && j.ok && typeof j.stakesByUserId === "object" && j.stakesByUserId) {
          setStakesByUserId(j.stakesByUserId);
        }
      } catch { /* ignore */ }
    })();
  }, [refreshStakesToken, marketId, supabaseMode]);

  // ── Realtime subscription ──────────────────────────────────
  useEffect(() => {
    if (!supabaseMode || !isUuidString(marketId)) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`boat_comments:${marketId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "boat_comments", filter: `bet_id=eq.${marketId}` },
        (payload) => {
          const row = payload.new as {
            id?: string;
            user_id?: string;
            author_display?: string;
            content?: string;
            created_at?: string;
          };
          if (!row.id || !row.user_id || !row.content || !row.created_at) return;
          setDbComments((prev) => {
            if (prev.some((c) => c.id === row.id)) return prev;
            return [...prev, {
              id: row.id,
              userId: row.user_id,
              author: String(row.author_display ?? "익명"),
              content: row.content,
              createdAt: row.created_at,
            }].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
          });
        },
      )
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [marketId, supabaseMode]);

  // ── submit ────────────────────────────────────────────────
  const submitDb = async () => {
    const t = commentText.trim();
    if (!t) return;
    try {
      const res = await fetch(`/api/bets/${encodeURIComponent(marketId)}/comments`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ content: t }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        comment?: DbComment;
        error?: string;
        details?: string;
      };
      if (res.ok && j.ok && j.comment) {
        setCommentText("");
        setDbComments((prev) => {
          if (prev.some((c) => c.id === j.comment!.id)) return prev;
          return [...prev, j.comment!].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          );
        });
        return;
      }
      const detailLine = [j.details, j.error].filter(Boolean).join(" — ");
      // 서버 실패 시 로컬 저장 (userId도 함께 저장해서 stakesByUserId 매핑 가능하게)
      const localRow = addMarketComment(marketId, t, {
        author: currentUser?.displayName,
        userId: currentUser?.id,
      });
      if (localRow) {
        setCommentText("");
        setOfflineComments((prev) =>
          [...prev.filter((x) => x.id !== localRow.id), localRow].sort(
            (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
          ),
        );
        window.alert(
          res.status === 401
            ? "로그인 세션이 없어 이 기기에만 저장했습니다."
            : (detailLine
              ? `서버 저장 실패: ${detailLine}\n이 기기에만 저장했습니다.`
              : "서버에 저장하지 못해 이 기기에만 저장했습니다."),
        );
        return;
      }
      window.alert(detailLine || "댓글 등록에 실패했습니다.");
    } catch {
      window.alert("네트워크 오류로 댓글을 등록하지 못했습니다.");
    }
  };

  const submitLocal = () => {
    const t = commentText.trim();
    if (!t) return;
    onLocalAddComment(t);
    setCommentText("");
  };

  // ── merged list ────────────────────────────────────────────
  const listForRender = useMemo((): Array<DbComment | MarketComment> => {
    if (!supabaseMode) return localComments;
    const merged: Array<DbComment | MarketComment> = [...dbComments];
    const seen = new Set(dbComments.map((c) => c.id));
    for (const oc of offlineComments) {
      if (!seen.has(oc.id)) merged.push(oc);
    }
    return merged.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [supabaseMode, localComments, dbComments, offlineComments]);

  // ── stake 조회 헬퍼 ────────────────────────────────────────
  const getStakeForComment = useCallback(
    (c: DbComment | MarketComment): UserStakeSummary | null => {
      // DbComment는 userId가 있음
      const uid = "userId" in c && typeof c.userId === "string" && c.userId
        ? c.userId
        : undefined;

      if (uid) {
        const fromDb = stakesByUserId[uid];
        if (fromDb) return fromDb;
      }

      // MarketComment의 경우 로컬 베팅에서 조회
      const fromLocal = aggregateLocalAuthorStakes(localBets, marketId, c.author);
      if (fromLocal) return fromLocal;

      // 로컬 베팅도 없으면 stakesByUserId에서 author 이름으로 fallback 불가,
      // 단 현재 유저가 쓴 오프라인 댓글이면 currentUser.id로 조회
      if (currentUser && c.author === currentUser.displayName) {
        const fromServer = stakesByUserId[currentUser.id];
        if (fromServer) return fromServer;
      }

      return null;
    },
    [stakesByUserId, localBets, marketId, currentUser],
  );

  // ── render ─────────────────────────────────────────────────
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-foreground">
          댓글 <span className="text-muted-foreground">({listForRender.length})</span>
        </div>
      </div>

      {loadError && supabaseMode && (
        <p className="text-xs text-destructive mt-2">{loadError}</p>
      )}
      {commentsNotice && supabaseMode && !loadError && (
        <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{commentsNotice}</p>
      )}

      <div className="mt-4 flex-1 min-h-0 overflow-y-auto pr-1 space-y-2">
        {listForRender.length === 0 ? (
          <div className="text-sm text-muted-foreground py-10 text-center">아직 댓글이 없습니다.</div>
        ) : (
          listForRender.map((c) => {
            const stake = getStakeForComment(c);
            const userId = "userId" in c && typeof c.userId === "string" ? c.userId : undefined;
            return (
              <CommentCard
                key={c.id}
                author={c.author}
                userId={userId}
                commentId={c.id}
                createdAt={c.createdAt}
                content={c.content}
                stake={stake}
                resolveRepColor={resolveRepColor}
                getOptionLabel={getOptionLabel}
                canReport={!!currentUser}
              />
            );
          })
        )}
      </div>

      <div className="mt-4 flex items-center gap-2 shrink-0">
        <Input
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          placeholder="댓글을 입력하세요"
          className="flex-1"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void (supabaseMode ? submitDb() : submitLocal());
            }
          }}
        />
        <Button
          type="button"
          onClick={() => void (supabaseMode ? submitDb() : submitLocal())}
          className="bg-chart-5 text-primary-foreground hover:bg-chart-5/90"
        >
          등록
        </Button>
      </div>
    </div>
  );
}
