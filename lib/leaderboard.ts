"use client";

import { TIER_THRESHOLDS } from "@/lib/level-system";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export interface LeaderboardEntry {
  displayName: string;
  level: number;         // 수동 레벨 (1-56)
  currentPoints: number; // 현재 보유 페블
  levelUpSpent: number;  // 레벨업에 쓴 누적 페블 (= TIER_THRESHOLDS[level-1])
  totalWealth: number;   // 순위 기준: levelUpSpent + currentPoints
}

// ─── 스토리지 키 ──────────────────────────────────────────────────────────────

const AUTHOR_POINTS_KEY       = "voters.author.lvl.v1";
const AUTHOR_MANUAL_LEVEL_KEY = "voters.author.manual-level.v1";
const ADMIN_NAMES_KEY         = "voters.admin.names.v1";

// ─── 운영자 이름 등록 ─────────────────────────────────────────────────────────

/** 운영자 display name을 등록해 리더보드에서 제외되도록 합니다. */
export function registerAdminName(displayName: string): void {
  if (typeof window === "undefined" || !displayName) return;
  try {
    const raw = window.localStorage.getItem(ADMIN_NAMES_KEY);
    const names: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    if (!names.includes(displayName)) {
      names.push(displayName);
      window.localStorage.setItem(ADMIN_NAMES_KEY, JSON.stringify(names));
    }
  } catch {}
}

export function getAdminNames(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(ADMIN_NAMES_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

// ─── 리더보드 계산 ────────────────────────────────────────────────────────────

/**
 * 알려진 유저(캐시에 등록된 유저)들의 순위를 반환합니다.
 *
 * 순위 기준 = 레벨업 누적 소비 페블 + 현재 보유 페블
 *   - 레벨업 누적 소비 = TIER_THRESHOLDS[level - 1]
 *     (레벨 L 에 도달하기 위해 쓴 누적 페블)
 *   - 현재 보유 = author points cache
 */
export function getLeaderboard(): LeaderboardEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const pointsRaw = window.localStorage.getItem(AUTHOR_POINTS_KEY);
    const levelRaw  = window.localStorage.getItem(AUTHOR_MANUAL_LEVEL_KEY);

    const pointsCache: Record<string, number> = pointsRaw
      ? (JSON.parse(pointsRaw) as Record<string, number>)
      : {};
    const levelCache: Record<string, number> = levelRaw
      ? (JSON.parse(levelRaw) as Record<string, number>)
      : {};

    const adminNames = getAdminNames();
    const allNames = new Set([
      ...Object.keys(pointsCache),
      ...Object.keys(levelCache),
    ]);

    const entries: LeaderboardEntry[] = [];
    for (const name of allNames) {
      if (adminNames.includes(name)) continue;
      if (!name || name === "익명") continue;

      const level         = Math.max(1, Math.min(56, levelCache[name] ?? 1));
      const currentPoints = Math.max(0, pointsCache[name] ?? 0);
      const levelUpSpent  = TIER_THRESHOLDS[level - 1] ?? 0;
      const totalWealth   = levelUpSpent + currentPoints;

      entries.push({ displayName: name, level, currentPoints, levelUpSpent, totalWealth });
    }

    return entries.sort((a, b) => b.totalWealth - a.totalWealth);
  } catch {
    return [];
  }
}
