"use client";

/**
 * 로컬 전용 유저 제재 상태 (localStorage).
 * 운영자 화면에서만 읽고 쓰며, 실제 서버 차단과는 별개일 수 있습니다.
 */

const STORAGE_KEY = "voters.user.moderation.v1";

export type UserModerationStatus = {
  blocked: boolean;
  /** ISO — 만료되었으면 UI에서는 null 취급 */
  suspendedUntil: string | null;
};

type ModRecord = {
  blocked?: boolean;
  suspendedUntil?: string | null;
};

function readAll(): Record<string, ModRecord> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const p = JSON.parse(raw) as Record<string, ModRecord>;
    return p && typeof p === "object" ? p : {};
  } catch {
    return {};
  }
}

function writeAll(next: Record<string, ModRecord>) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("voters:moderationUpdated"));
}

function dnKey(displayName: string): string {
  return `dn:${displayName.trim().toLowerCase()}`;
}

function uidKey(userId: string | null | undefined): string | null {
  return userId && userId !== "anon" ? `uid:${userId}` : null;
}

function mergeRecord(
  displayName: string,
  userId: string | null,
): ModRecord {
  const all = readAll();
  const a = all[dnKey(displayName)] ?? {};
  const uk = uidKey(userId);
  const b = uk ? (all[uk] ?? {}) : {};
  return { ...a, ...b };
}

function applyRecord(
  displayName: string,
  userId: string | null,
  patch: Partial<ModRecord>,
) {
  const all = readAll();
  const prev = mergeRecord(displayName, userId);
  const next = { ...prev, ...patch };
  all[dnKey(displayName)] = next;
  const uk = uidKey(userId);
  if (uk) all[uk] = next;
  writeAll(all);
}

export function getUserModerationStatus(
  displayName: string,
  userId: string | null,
): UserModerationStatus {
  const r = mergeRecord(displayName, userId);
  const now = Date.now();
  let suspendedUntil: string | null = r.suspendedUntil ?? null;
  if (suspendedUntil) {
    const t = Date.parse(suspendedUntil);
    if (!Number.isFinite(t) || t <= now) suspendedUntil = null;
  }
  return {
    blocked: !!r.blocked,
    suspendedUntil,
  };
}

export function blockUserByDisplayName(
  displayName: string,
  userId: string | null,
): boolean {
  applyRecord(displayName, userId, { blocked: true });
  return true;
}

export function suspendUserByDisplayName(
  displayName: string,
  days: number,
  userId: string | null,
): boolean {
  const d = Math.floor(Number(days));
  if (!Number.isFinite(d) || d <= 0) return false;
  const until = new Date(Date.now() + d * 86400000).toISOString();
  applyRecord(displayName, userId, { suspendedUntil: until });
  return true;
}

export function liftAllModerationForUser(
  displayName: string,
  userId: string | null,
): void {
  const all = readAll();
  delete all[dnKey(displayName)];
  const uk = uidKey(userId);
  if (uk) delete all[uk];
  writeAll(all);
}
