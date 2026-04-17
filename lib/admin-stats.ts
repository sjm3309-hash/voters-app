"use client";

import { ADMIN_BALANCE, earnUserPoints, getAllAuthorUids, getUidByDisplayName } from "@/lib/points";
import { TIER_THRESHOLDS, getTierByLevel } from "@/lib/level-system";
import { getAdminNames } from "@/lib/leaderboard";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export interface AdminUserEntry {
  displayName: string;
  level: number;
  levelLabel: string;   // e.g. "빨강 동그라미"
  pebbles: number;      // 현재 보유 페블
  totalWealth: number;  // 레벨업 소비 + 보유 (순위 기준)
  isAdmin: boolean;
}

export interface PebbleStats {
  totalUsers: number;       // 알려진 전체 유저 수 (운영자 포함)
  regularUsers: number;     // 일반 유저 수
  totalPebbles: number;     // 일반 유저 총 보유 페블
  avgPebbles: number;       // 일반 유저 평균 보유 페블
  maxPebbles: number;       // 최다 보유 유저 페블
  totalWelcomeBonus: number;// 지급된 환영 보너스 추정 (3000 × 가입자 수)
  adminPebbles: number;     // 운영자 고정 잔액
}

// ─── 내부 유틸리티 ────────────────────────────────────────────────────────────

function getAllKnownUsers(): AdminUserEntry[] {
  if (typeof window === "undefined") return [];

  try {
    const pointsRaw = window.localStorage.getItem("voters.author.lvl.v1");
    const levelRaw  = window.localStorage.getItem("voters.author.manual-level.v1");
    const adminRaw  = window.localStorage.getItem("voters.admin.names.v1");

    const pointsCache: Record<string, number> = pointsRaw
      ? (JSON.parse(pointsRaw) as Record<string, number>)
      : {};
    const levelCache: Record<string, number> = levelRaw
      ? (JSON.parse(levelRaw) as Record<string, number>)
      : {};
    const adminNames: string[] = adminRaw
      ? (JSON.parse(adminRaw) as string[])
      : [];

    const allNames = new Set([
      ...Object.keys(pointsCache),
      ...Object.keys(levelCache),
    ]);

    const entries: AdminUserEntry[] = [];
    for (const name of allNames) {
      if (!name || name === "익명") continue;

      const isAdminName = adminNames.includes(name);
      const level       = Math.max(1, Math.min(56, levelCache[name] ?? 1));
      const pebbles     = isAdminName ? ADMIN_BALANCE : Math.max(0, pointsCache[name] ?? 0);
      const levelUpSpent = TIER_THRESHOLDS[level - 1] ?? 0;
      const totalWealth  = isAdminName ? ADMIN_BALANCE : levelUpSpent + pebbles;

      const tier       = getTierByLevel(level);
      const levelLabel = tier?.label ?? `Lv.${level}`;

      entries.push({
        displayName: name,
        level,
        levelLabel,
        pebbles,
        totalWealth,
        isAdmin: isAdminName,
      });
    }

    return entries;
  } catch {
    return [];
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** 유저 목록 (페블 내림차순, 운영자 먼저) */
export function getAdminUserList(): AdminUserEntry[] {
  const all = getAllKnownUsers();
  return all.sort((a, b) => {
    if (a.isAdmin !== b.isAdmin) return a.isAdmin ? -1 : 1;
    return b.pebbles - a.pebbles;
  });
}

// ─── 페블 지급 ────────────────────────────────────────────────────────────────

export interface GrantResult {
  succeeded: string[];  // 성공한 displayName 목록
  failed: string[];     // 실패한 displayName 목록 (userId 미확인 등)
}

/**
 * localStorage를 스캔해 알려진 모든 userId 목록 반환
 * (voters.points.v2.{uuid} 키 기반 — 캐시 없이도 동작)
 */
export function scanAllKnownUserIds(): string[] {
  if (typeof window === "undefined") return [];
  const ids: string[] = [];
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k?.startsWith("voters.points.v2.")) {
        const uid = k.replace("voters.points.v2.", "");
        if (uid && uid !== "anon") ids.push(uid);
      }
    }
  } catch {}
  return ids;
}

/**
 * 특정 유저에게 페블 지급 (displayName 기준)
 * @returns true = 성공, false = userId 미확인 또는 운영자
 */
export function grantPebblesToUser(
  displayName: string,
  amount: number,
  reason = "운영자 지급",
): boolean {
  if (typeof window === "undefined") return false;
  const uid = getUidByDisplayName(displayName);
  if (!uid) return false;

  const adminNames = getAdminNames();
  if (adminNames.includes(displayName)) return false; // 운영자는 고정이므로 제외

  earnUserPoints(uid, amount, `🎁 ${reason}`);
  return true;
}

/**
 * userId를 직접 지정해 페블 지급 (캐시 없어도 사용 가능)
 * @returns true = 성공, false = 운영자이거나 잘못된 userId
 */
export function grantPebblesByUserId(
  userId: string,
  amount: number,
  reason = "운영자 지급",
): boolean {
  if (typeof window === "undefined" || !userId || userId === "anon") return false;
  // 운영자 플래그 확인
  if (window.localStorage.getItem(`voters.admin.flag.v1.${userId}`)) return false;
  earnUserPoints(userId, amount, `🎁 ${reason}`);
  return true;
}

/** 전체 유저에게 페블 일괄 지급 (운영자 제외) */
export function grantPebblesToAll(
  amount: number,
  reason = "운영자 일괄 지급",
): GrantResult {
  const adminNames = getAdminNames();
  const uidMap = getAllAuthorUids();
  const succeeded: string[] = [];
  const failed: string[] = [];

  for (const [displayName, uid] of Object.entries(uidMap)) {
    if (!displayName || displayName === "익명") { failed.push(displayName); continue; }
    if (adminNames.includes(displayName)) continue; // 운영자 제외
    try {
      earnUserPoints(uid, amount, `🎁 ${reason}`);
      succeeded.push(displayName);
    } catch {
      failed.push(displayName);
    }
  }
  return { succeeded, failed };
}

/** 페블 전체 통계 */
export function getPebbleStats(): PebbleStats {
  const all     = getAllKnownUsers();
  const regular = all.filter((u) => !u.isAdmin);
  const admins  = all.filter((u) => u.isAdmin);

  const totalPebbles = regular.reduce((s, u) => s + u.pebbles, 0);
  const maxPebbles   = regular.reduce((m, u) => Math.max(m, u.pebbles), 0);
  const avgPebbles   = regular.length > 0 ? Math.round(totalPebbles / regular.length) : 0;
  const adminPebbles = admins.reduce((s, u) => s + u.pebbles, 0);

  // 가입된 유저 수 추정 (welcomed 키 카운팅)
  let welcomedCount = 0;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k?.startsWith("voters.points.welcomed.v1.")) welcomedCount++;
    }
  } catch {}

  return {
    totalUsers:        all.length,
    regularUsers:      regular.length,
    totalPebbles,
    avgPebbles,
    maxPebbles,
    totalWelcomeBonus: welcomedCount * 3000,
    adminPebbles,
  };
}
