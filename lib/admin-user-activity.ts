"use client";

import { loadBoardPosts, type BoardPost } from "@/lib/board";
import { loadComments, type Comment } from "@/lib/comments";
import { loadUserMarkets } from "@/lib/markets";
import { loadAllMarketComments } from "@/lib/market-comments";

export type AdminMarketSummary = {
  id: string;
  question: string;
  createdAt: string;
};

export type AdminBoardCommentRow = {
  id: string;
  postId: string;
  postTitle?: string;
  content: string;
  createdAt: string;
};

export type AdminMarketCommentRow = {
  id: string;
  marketId: string;
  marketQuestion?: string;
  content: string;
  createdAt: string;
};

function normName(s: string): string {
  return s.trim().toLowerCase();
}

/** 이 브라우저 localStorage 기준 — 작성 보트 */
export function getUserMarketsForAdmin(
  displayName: string,
  knownUserId: string | null,
): AdminMarketSummary[] {
  const dn = normName(displayName);
  return loadUserMarkets()
    .filter((m) => {
      const nameMatch = normName(m.authorName ?? "") === dn;
      const idMatch =
        !!knownUserId &&
        knownUserId !== "anon" &&
        m.authorId === knownUserId;
      return nameMatch || idMatch;
    })
    .map((m) => ({
      id: m.id,
      question: m.question,
      createdAt: m.createdAt,
    }))
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
}

export function getUserBoardPostsForAdmin(displayName: string): BoardPost[] {
  const dn = normName(displayName);
  return loadBoardPosts()
    .filter((p) => normName(p.author ?? "") === dn)
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
}

export function getUserBoardCommentsForAdmin(
  displayName: string,
): AdminBoardCommentRow[] {
  const dn = normName(displayName);
  const posts = loadBoardPosts();
  const byPostId = new Map(posts.map((p) => [p.id, p]));
  return loadComments()
    .filter((c: Comment) => normName(c.author ?? "") === dn)
    .map((c) => ({
      id: c.id,
      postId: c.postId,
      postTitle: byPostId.get(c.postId)?.title,
      content: c.content,
      createdAt: c.createdAt,
    }))
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
}

export function getUserMarketCommentsForAdmin(
  displayName: string,
): AdminMarketCommentRow[] {
  const dn = normName(displayName);
  const markets = loadUserMarkets();
  const byMarketId = new Map(markets.map((m) => [m.id, m]));
  return loadAllMarketComments()
    .filter((c) => normName(c.author ?? "") === dn)
    .map((c) => ({
      id: c.id,
      marketId: c.marketId,
      marketQuestion: byMarketId.get(c.marketId)?.question,
      content: c.content,
      createdAt: c.createdAt,
    }))
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
}
