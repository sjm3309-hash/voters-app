"use client";

/**
 * 일일 보상 시스템
 * - 하루 기준: 한국시간(KST, UTC+9) 자정(00:00) 리셋
 *
 * 보상 규칙
 * ─────────────────────────────────────────
 * 출석               레벨 기반 P / 일  ← 서버 /api/pebbles/daily-reward 에서 처리
 * 첫 게시글 작성      500 P / 일
 * 댓글 작성          100 P / 건 (하루 최대 500 P)
 * 좋아요 10개 당      100 P (내가 쓴 글 기준, 누적)
 *
 * ※ 사이트 화폐 단위: 페블(Pebble), 기호 P
 */

import { earnUserPoints } from "@/lib/points";

// ─── KST 기반 날짜 키 (자정 00:00 리셋) ──────────────────────────────────────

export function getKSTDay(): string {
  const now = new Date();
  const kstMs = now.getTime() + 9 * 60 * 60 * 1000;
  const kst = new Date(kstMs);
  return kst.toISOString().slice(0, 10);
}

// ─── 일일 기록 ────────────────────────────────────────────────────────────────

interface DailyRecord {
  firstPost: boolean;
  commentPoints: number;
}

const DAILY_KEY = (uid: string, day: string) => `voters.daily.${uid}.${day}`;
const LIKE_KEY = "voters.likes.rewards.v1";

function loadDaily(userId: string): DailyRecord {
  if (typeof window === "undefined") return { firstPost: false, commentPoints: 0 };
  const raw = window.localStorage.getItem(DAILY_KEY(userId, getKSTDay()));
  if (!raw) return { firstPost: false, commentPoints: 0 };
  try {
    return JSON.parse(raw) as DailyRecord;
  } catch {
    return { firstPost: false, commentPoints: 0 };
  }
}

function saveDaily(userId: string, record: DailyRecord): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(DAILY_KEY(userId, getKSTDay()), JSON.stringify(record));
}

// ─── 첫 게시글 보상 ───────────────────────────────────────────────────────────

export async function checkAndGrantFirstPost(userId: string): Promise<boolean> {
  if (!userId || userId === "anon") return false;
  const rec = loadDaily(userId);
  if (rec.firstPost) return false;
  rec.firstPost = true;
  saveDaily(userId, rec);
  await earnUserPoints(userId, 500, "✍️ 첫 게시글 작성 보너스");
  return true;
}

// ─── 댓글 보상 ────────────────────────────────────────────────────────────────

export async function checkAndGrantCommentReward(userId: string): Promise<boolean> {
  if (!userId || userId === "anon") return false;
  const rec = loadDaily(userId);
  if (rec.commentPoints >= 500) return false;
  rec.commentPoints = Math.min(500, rec.commentPoints + 100);
  saveDaily(userId, rec);
  await earnUserPoints(userId, 100, "💬 댓글 작성 보너스");
  return true;
}

/** 오늘 남은 댓글 보상 가능 횟수 (0~5) */
export function remainingCommentRewards(userId: string): number {
  if (!userId || userId === "anon") return 0;
  const rec = loadDaily(userId);
  return Math.floor((500 - rec.commentPoints) / 100);
}

// ─── 좋아요 보상 ──────────────────────────────────────────────────────────────

export async function checkAndGrantLikeReward(
  authorUserId: string,
  postId: string,
  currentLikes: number,
): Promise<number> {
  if (!authorUserId || authorUserId === "anon") return 0;
  if (typeof window === "undefined") return 0;

  const raw = window.localStorage.getItem(LIKE_KEY);
  const all: Record<string, number> = raw ? (JSON.parse(raw) as Record<string, number>) : {};

  const rewarded = all[postId] ?? 0;
  const earned = Math.floor(currentLikes / 10);
  const newBlocks = earned - rewarded;

  if (newBlocks <= 0) return 0;

  all[postId] = earned;
  window.localStorage.setItem(LIKE_KEY, JSON.stringify(all));

  const points = newBlocks * 100;
  await earnUserPoints(
    authorUserId,
    points,
    `👍 게시글 좋아요 ${earned * 10}개 달성 보너스`,
  );
  return points;
}

// ─── 오늘 보상 현황 요약 ──────────────────────────────────────────────────────

export interface DailyStatus {
  day: string;
  firstPost: boolean;
  commentPoints: number;
  commentRemaining: number;
}

export function getDailyStatus(userId: string): DailyStatus {
  const rec = loadDaily(userId);
  return {
    day: getKSTDay(),
    firstPost: rec.firstPost,
    commentPoints: rec.commentPoints,
    commentRemaining: Math.floor((500 - rec.commentPoints) / 100),
  };
}
