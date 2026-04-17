"use client";

export type LikeEntityType = "market" | "post";

export type LikeTarget = {
  type: LikeEntityType;
  id: string;
};

const COUNTS_KEY = "voters.likes.counts.v1";
const USERS_PREFIX = "voters.likes.user.v1.";

function targetKey(t: LikeTarget): string {
  return `${t.type}:${t.id}`;
}

function safeParseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function loadCounts(): Record<string, number> {
  if (typeof window === "undefined") return {};
  return safeParseJson<Record<string, number>>(window.localStorage.getItem(COUNTS_KEY), {});
}

function saveCounts(next: Record<string, number>) {
  window.localStorage.setItem(COUNTS_KEY, JSON.stringify(next));
}

function userKey(userId: string) {
  return `${USERS_PREFIX}${userId || "anon"}`;
}

function loadUserSet(userId: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  const raw = window.localStorage.getItem(userKey(userId));
  const arr = safeParseJson<string[]>(raw, []);
  return new Set(Array.isArray(arr) ? arr : []);
}

function saveUserSet(userId: string, set: Set<string>) {
  window.localStorage.setItem(userKey(userId), JSON.stringify(Array.from(set)));
}

export function getLikeCount(target: LikeTarget): number {
  if (typeof window === "undefined") return 0;
  const key = targetKey(target);
  const counts = loadCounts();
  const v = counts[key];
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
}

export function hasLiked(target: LikeTarget, userId: string): boolean {
  if (typeof window === "undefined") return false;
  const set = loadUserSet(userId);
  return set.has(targetKey(target));
}

export function toggleLike(target: LikeTarget, userId: string) {
  if (typeof window === "undefined") return { liked: false, count: 0 };

  const key = targetKey(target);
  const set = loadUserSet(userId);
  const counts = loadCounts();

  const prevCount = typeof counts[key] === "number" && Number.isFinite(counts[key]) ? counts[key]! : 0;
  const liked = set.has(key);

  const nextLiked = !liked;
  if (nextLiked) set.add(key);
  else set.delete(key);

  const nextCount = Math.max(0, Math.floor(prevCount + (nextLiked ? 1 : -1)));
  counts[key] = nextCount;

  saveUserSet(userId, set);
  saveCounts(counts);

  window.dispatchEvent(
    new CustomEvent("voters:likesUpdated", { detail: { key, count: nextCount, liked: nextLiked } })
  );

  return { liked: nextLiked, count: nextCount };
}

