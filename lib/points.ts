"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { cacheAuthorLevel, cacheAuthorManualLevel, getUserManualLevel } from "@/lib/level-system";
import { registerAdminName } from "@/lib/leaderboard";
import { isAdminEmail } from "@/lib/admin";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PointsTransaction {
  id: string;
  date: string;        // ISO timestamp
  type: "bonus" | "vote" | "refund" | "reward" | "other";
  description: string;
  amount: number;      // 양수 = 획득, 음수 = 사용
  balance: number;     // 거래 후 잔액
}

// ─── Storage Keys ─────────────────────────────────────────────────────────────

const POINTS_KEY   = (uid: string) => `voters.points.v2.${uid}`;
const HISTORY_KEY  = (uid: string) => `voters.points.history.v1.${uid}`;
const WELCOMED_KEY = (uid: string) => `voters.points.welcomed.v1.${uid}`;
const AUTHOR_UID_KEY = "voters.author.uid.v1"; // displayName → userId 매핑

/** displayName → userId 매핑 캐시 저장 */
export function cacheAuthorUid(displayName: string, userId: string): void {
  if (typeof window === "undefined" || !displayName || !userId || userId === "anon") return;
  try {
    const raw = window.localStorage.getItem(AUTHOR_UID_KEY);
    const cache: Record<string, string> = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    cache[displayName] = userId;
    window.localStorage.setItem(AUTHOR_UID_KEY, JSON.stringify(cache));
  } catch {}
}

/** displayName으로 userId 조회 */
export function getUidByDisplayName(displayName: string): string | null {
  if (typeof window === "undefined" || !displayName) return null;
  try {
    const raw = window.localStorage.getItem(AUTHOR_UID_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw) as Record<string, string>;
    return cache[displayName] ?? null;
  } catch { return null; }
}

/** 알려진 displayName → userId 맵 전체 반환 */
export function getAllAuthorUids(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(AUTHOR_UID_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch { return {}; }
}

export const WELCOME_BONUS   = 3000;
export const ADMIN_BALANCE   = 1_000_000; // 운영자 고정 잔액

// 운영자 플래그 (userId → isAdmin) — 로그인 시 저장
const ADMIN_FLAG_KEY = (uid: string) => `voters.admin.flag.v1.${uid}`;

export function setAdminFlag(userId: string): void {
  if (typeof window === "undefined" || !userId || userId === "anon") return;
  window.localStorage.setItem(ADMIN_FLAG_KEY(userId), "1");
}

export function isAdminUser(userId: string): boolean {
  if (typeof window === "undefined" || !userId || userId === "anon") return false;
  return !!window.localStorage.getItem(ADMIN_FLAG_KEY(userId));
}

// ─── Low-level point storage ──────────────────────────────────────────────────

export function loadUserPoints(userId: string): number {
  if (typeof window === "undefined" || !userId || userId === "anon") return 0;
  const raw = window.localStorage.getItem(POINTS_KEY(userId));
  if (!raw) return 0;
  try {
    const n = JSON.parse(raw) as number;
    return typeof n === "number" && Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

function savePoints(userId: string, amount: number): void {
  if (typeof window === "undefined" || !userId || userId === "anon") return;
  window.localStorage.setItem(POINTS_KEY(userId), JSON.stringify(amount));
  window.dispatchEvent(
    new CustomEvent("voters:pointsUpdated", { detail: { userId, points: amount } })
  );
}

// ─── History ──────────────────────────────────────────────────────────────────

export function loadPointsHistory(userId: string): PointsTransaction[] {
  if (typeof window === "undefined" || !userId || userId === "anon") return [];
  const raw = window.localStorage.getItem(HISTORY_KEY(userId));
  if (!raw) return [];
  try {
    return JSON.parse(raw) as PointsTransaction[];
  } catch {
    return [];
  }
}

function appendTransaction(
  userId: string,
  tx: Omit<PointsTransaction, "id" | "date">
): void {
  if (typeof window === "undefined" || !userId || userId === "anon") return;
  const history = loadPointsHistory(userId);
  const entry: PointsTransaction = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    date: new Date().toISOString(),
    ...tx,
  };
  history.unshift(entry); // 최신 순
  window.localStorage.setItem(HISTORY_KEY(userId), JSON.stringify(history.slice(0, 200)));
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** 가입 환영 보너스 3000P (최초 1회만) */
export function grantWelcomeBonus(userId: string): void {
  if (typeof window === "undefined" || !userId || userId === "anon") return;
  if (window.localStorage.getItem(WELCOMED_KEY(userId))) return;

  window.localStorage.setItem(WELCOMED_KEY(userId), "1");
  const current = loadUserPoints(userId);
  const next = current + WELCOME_BONUS;
  savePoints(userId, next);
  appendTransaction(userId, {
    type: "bonus",
    description: "🎉 가입 환영 보너스",
    amount: WELCOME_BONUS,
    balance: next,
  });
}

/** 페블 직접 설정 (구버전 호환) */
export function setUserPoints(userId: string, nextPoints: number): void {
  if (typeof window === "undefined") return;
  savePoints(userId, Math.max(0, Math.floor(Number(nextPoints) || 0)));
}

/** 페블 소비 (보트 등) */
export function spendUserPoints(
  userId: string,
  amount: number,
  description = "보트 페블 사용"
): { ok: boolean; points: number } {
  if (typeof window === "undefined") return { ok: false, points: 0 };
  // 운영자는 페블 소비 불가
  if (isAdminUser(userId)) return { ok: false, points: ADMIN_BALANCE };
  const a = Math.floor(Number(amount));
  if (!Number.isFinite(a) || a <= 0) return { ok: false, points: loadUserPoints(userId) };
  const current = loadUserPoints(userId);
  if (current < a) return { ok: false, points: current };
  const next = current - a;
  savePoints(userId, next);
  appendTransaction(userId, {
    type: "vote",
    description,
    amount: -a,
    balance: next,
  });
  return { ok: true, points: next };
}

/** 페블 획득 (리워드 등) */
export function earnUserPoints(
  userId: string,
  amount: number,
  description = "페블 획득"
): number {
  if (typeof window === "undefined") return 0;
  const a = Math.floor(Number(amount));
  if (!Number.isFinite(a) || a <= 0) return loadUserPoints(userId);
  const current = loadUserPoints(userId);
  const next = current + a;
  savePoints(userId, next);
  appendTransaction(userId, {
    type: "reward",
    description,
    amount: a,
    balance: next,
  });
  return next;
}

// ─── React hook ───────────────────────────────────────────────────────────────

export function useUserPointsBalance() {
  const [userId, setUserId] = useState<string>("anon");
  const [points, setPoints] = useState<number>(0);

  useEffect(() => {
    const supabase = createClient();

    const sync = (uid: string) => {
      setUserId(uid);
      setPoints(loadUserPoints(uid));
    };

    const applySession = (uid: string, user: import("@supabase/supabase-js").User | null) => {
      if (uid !== "anon") {
        const admin = isAdminEmail(user?.email);
        if (admin) {
          // 운영자: 플래그 저장 + 잔액 고정
          setAdminFlag(uid);
          setUserId(uid);
          setPoints(ADMIN_BALANCE);
        } else {
          grantWelcomeBonus(uid);
        }
        // display name → 레벨 캐시 업데이트 (게시글/댓글 아이콘에 사용)
        const displayName =
          user?.user_metadata?.nickname ??
          user?.user_metadata?.full_name ??
          user?.user_metadata?.name ??
          user?.email?.split("@")[0] ??
          "";
        if (displayName) {
          cacheAuthorLevel(displayName, admin ? ADMIN_BALANCE : loadUserPoints(uid));
          // 수동 레벨 캐시 업데이트 (AuthorLevelIcon 표시용)
          cacheAuthorManualLevel(displayName, getUserManualLevel(uid));
          // displayName → userId 매핑 저장 (관리자 페블 지급용)
          cacheAuthorUid(displayName, uid);
          // 운영자면 리더보드 제외 목록에 등록
          if (admin) {
            registerAdminName(displayName);
          }
        }
        if (!admin) sync(uid);
      } else {
        sync(uid);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      const uid = session?.user?.id ?? "anon";
      applySession(uid, session?.user ?? null);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id ?? "anon";
      applySession(uid, session?.user ?? null);
    });

    const onUpdated = (e: Event) => {
      const ev = e as CustomEvent<{ userId: string; points: number }>;
      if (ev.detail) {
        // 운영자는 항상 고정 잔액 유지
        if (isAdminUser(ev.detail.userId)) {
          setPoints(ADMIN_BALANCE);
          return;
        }
        setPoints(ev.detail.points);
        // 페블 변경 시 display name 캐시도 갱신
        supabase.auth.getSession().then(({ data: { session } }) => {
          const u = session?.user;
          if (!u) return;
          const name =
            u.user_metadata?.nickname ??
            u.user_metadata?.full_name ??
            u.user_metadata?.name ??
            u.email?.split("@")[0] ??
            "";
          if (name) cacheAuthorLevel(name, ev.detail.points);
        });
      }
    };

    window.addEventListener("voters:pointsUpdated", onUpdated);

    return () => {
      authListener.subscription.unsubscribe();
      window.removeEventListener("voters:pointsUpdated", onUpdated);
    };
  }, []);

  return { userId, points };
}
