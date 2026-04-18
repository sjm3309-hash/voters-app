"use client";

import { ADMIN_BALANCE, getAllAuthorUids, getUidByDisplayName } from "@/lib/points";
import { TIER_THRESHOLDS, formatLevelDisplay, getTierByLevel } from "@/lib/level-system";
import { getAdminNames } from "@/lib/leaderboard";

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export interface AdminUserEntry {
  displayName: string;
  level: number;
  levelLabel: string;   // e.g. "Lv.12"
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
      const levelLabel = tier?.label ?? formatLevelDisplay(level);

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

export type AdminGrantResult = { ok: true } | { ok: false; error: string };

async function postAdminGrant(
  targetUserId: string,
  amount: number,
  reason: string,
): Promise<AdminGrantResult> {
  const res = await fetch("/api/admin/pebbles/grant", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ targetUserId, amount, reason }),
  });
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (res.ok && j.ok === true) return { ok: true };
  const err =
    typeof j.error === "string"
      ? j.error
      : res.status === 403
        ? "forbidden"
        : res.status === 401
          ? "unauthorized"
          : `http_${res.status}`;
  return { ok: false, error: err };
}

/** 서버/클라이언트 오류 코드를 짧은 한글 안내로 바꿉니다(원문은 그대로 덧붙이지 않음). */
export function describeAdminGrantError(error: string): string {
  if (error === "admin_target") {
    return "로컬에서 운영자로 표시된 계정에는 지급할 수 없습니다.";
  }
  if (error === "invalid_user") return "유효하지 않은 사용자입니다.";
  if (error === "forbidden") return "관리자 권한이 필요합니다. 운영자 계정으로 다시 로그인했는지 확인하세요.";
  if (error === "unauthorized") return "로그인이 필요합니다.";
  if (error === "insufficient_pebbles") return "페블이 부족합니다.";
  if (error.startsWith("http_")) return "지급 실패 (서버 응답 오류)";
  return error;
}

/**
 * 특정 유저에게 페블 지급 (displayName 기준)
 * @returns true = 성공, false = userId 미확인 또는 운영자
 */
export async function grantPebblesToUser(
  displayName: string,
  amount: number,
  reason = "운영자 지급",
): Promise<AdminGrantResult> {
  if (typeof window === "undefined") return { ok: false, error: "invalid_user" };
  const uid = getUidByDisplayName(displayName);
  if (!uid) return { ok: false, error: "invalid_user" };

  const adminNames = getAdminNames();
  if (adminNames.includes(displayName)) return { ok: false, error: "admin_target" };

  return postAdminGrant(uid, amount, `🎁 ${reason}`);
}

/**
 * userId를 직접 지정해 페블 지급 (캐시 없어도 사용 가능)
 * @returns true = 성공, false = 운영자이거나 잘못된 userId
 */
export async function grantPebblesByUserId(
  userId: string,
  amount: number,
  reason = "운영자 지급",
): Promise<AdminGrantResult> {
  if (typeof window === "undefined" || !userId || userId === "anon") {
    return { ok: false, error: "invalid_user" };
  }
  if (window.localStorage.getItem(`voters.admin.flag.v1.${userId}`)) {
    return { ok: false, error: "admin_target" };
  }
  return postAdminGrant(userId, amount, `🎁 ${reason}`);
}

/** 전체 유저에게 페블 일괄 지급 (운영자 제외) */
export async function grantPebblesToAll(
  amount: number,
  reason = "운영자 일괄 지급",
): Promise<GrantResult> {
  const adminNames = getAdminNames();
  const uidMap = getAllAuthorUids();
  const succeeded: string[] = [];
  const failed: string[] = [];

  for (const [displayName, uid] of Object.entries(uidMap)) {
    if (!displayName || displayName === "익명") {
      failed.push(displayName);
      continue;
    }
    if (adminNames.includes(displayName)) continue;
    const g = await postAdminGrant(uid, amount, `🎁 ${reason}`);
    if (g.ok) succeeded.push(displayName);
    else failed.push(displayName);
  }
  return { succeeded, failed };
}

/** 페블 전체 통계 (로컬 캐시 기준 — 관리 화면에서는 mergeAdminUserListWithDbPebbles 후 아래 사용 권장) */
export function getPebbleStats(): PebbleStats {
  return computePebbleStatsFromEntries(getAllKnownUsers());
}

/** DB 병합된 유저 목록 기준 통계 */
export function computePebbleStatsFromEntries(all: AdminUserEntry[]): PebbleStats {
  const regular = all.filter((u) => !u.isAdmin);
  const admins = all.filter((u) => u.isAdmin);

  const totalPebbles = regular.reduce((s, u) => s + u.pebbles, 0);
  const maxPebbles = regular.reduce((m, u) => Math.max(m, u.pebbles), 0);
  const avgPebbles = regular.length > 0 ? Math.round(totalPebbles / regular.length) : 0;
  const adminPebbles = admins.reduce((s, u) => s + u.pebbles, 0);

  let welcomedCount = 0;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k?.startsWith("voters.points.welcomed.v1.")) welcomedCount++;
    }
  } catch {}

  return {
    totalUsers: all.length,
    regularUsers: regular.length,
    totalPebbles,
    avgPebbles,
    maxPebbles,
    totalWelcomeBonus: welcomedCount * 3000,
    adminPebbles,
  };
}

/**
 * 로컬 닉네임 목록 + 닉네임→UUID 맵으로 profiles.pebbles 조회 후 보유 페블·총자산 갱신.
 * UUID를 모르는 행은 기존 캐시 값 유지.
 */
export async function mergeAdminUserListWithDbPebbles(
  entries: AdminUserEntry[],
): Promise<AdminUserEntry[]> {
  if (typeof window === "undefined") return entries;

  const uidMap = getAllAuthorUids();
  const ids = [...new Set(Object.values(uidMap).filter((id) => id && id !== "anon"))];
  if (ids.length === 0) return entries;

  let balances: Record<string, number> = {};
  let adminFromEmail = new Set<string>();
  try {
    const res = await fetch("/api/admin/pebbles/lookup", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userIds: ids }),
    });
    const j = (await res.json().catch(() => ({}))) as {
      ok?: boolean;
      balances?: Record<string, number>;
      adminUserIds?: string[];
    };
    if (res.ok && j.ok && j.balances && typeof j.balances === "object") {
      balances = j.balances;
    }
    if (res.ok && j.ok && Array.isArray(j.adminUserIds)) {
      adminFromEmail = new Set(j.adminUserIds);
    }
  } catch {
    return entries;
  }

  return entries.map((entry) => {
    const uid = getUidByDisplayName(entry.displayName);

    /** 서버에서 운영자 이메일로 확인된 계정 → 로그인 화면과 동일하게 고정 잔액 */
    if (uid && adminFromEmail.has(uid)) {
      return {
        ...entry,
        pebbles: ADMIN_BALANCE,
        totalWealth: ADMIN_BALANCE,
        isAdmin: true,
      };
    }

    if (entry.isAdmin) return entry;

    if (!uid || balances[uid] === undefined) return entry;
    const pebbles = Math.max(0, Math.floor(Number(balances[uid])));
    const levelUpSpent = TIER_THRESHOLDS[entry.level - 1] ?? 0;
    const totalWealth = levelUpSpent + pebbles;
    return { ...entry, pebbles, totalWealth };
  });
}
