"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { cacheAuthorLevel, cacheAuthorManualLevel, getUserManualLevel } from "@/lib/level-system";
import { registerAdminName } from "@/lib/leaderboard";
import { isAdminEmail } from "@/lib/admin";
import { ADMIN_BALANCE } from "@/lib/points-constants";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PointsTransaction {
  id: string;
  date: string;
  type: "bonus" | "vote" | "refund" | "reward" | "other";
  description: string;
  amount: number;
  balance: number;
}

// ─── Storage Keys ─────────────────────────────────────────────────────────────

const POINTS_KEY = (uid: string) => `voters.points.v2.${uid}`;
const HISTORY_KEY = (uid: string) => `voters.points.history.v1.${uid}`;
const AUTHOR_UID_KEY = "voters.author.uid.v1";

export function cacheAuthorUid(displayName: string, userId: string): void {
  if (typeof window === "undefined" || !displayName || !userId || userId === "anon") return;
  try {
    const raw = window.localStorage.getItem(AUTHOR_UID_KEY);
    const cache: Record<string, string> = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    cache[displayName] = userId;
    window.localStorage.setItem(AUTHOR_UID_KEY, JSON.stringify(cache));
  } catch {}
}

export function getUidByDisplayName(displayName: string): string | null {
  if (typeof window === "undefined" || !displayName) return null;
  try {
    const raw = window.localStorage.getItem(AUTHOR_UID_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw) as Record<string, string>;
    return cache[displayName] ?? null;
  } catch {
    return null;
  }
}

export function getAllAuthorUids(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(AUTHOR_UID_KEY);
    return raw ? (JSON.parse(raw) as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export { WELCOME_BONUS, ADMIN_BALANCE } from "@/lib/points-constants";

const ADMIN_FLAG_KEY = (uid: string) => `voters.admin.flag.v1.${uid}`;

export function setAdminFlag(userId: string): void {
  if (typeof window === "undefined" || !userId || userId === "anon") return;
  window.localStorage.setItem(ADMIN_FLAG_KEY(userId), "1");
}

export function isAdminUser(userId: string): boolean {
  if (typeof window === "undefined" || !userId || userId === "anon") return false;
  return !!window.localStorage.getItem(ADMIN_FLAG_KEY(userId));
}

// ─── Low-level point storage (캐시 — 서버 GET /api/pebbles/balance 와 동기화) ─

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
    new CustomEvent("voters:pointsUpdated", { detail: { userId, points: amount } }),
  );
}

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
  tx: Omit<PointsTransaction, "id" | "date">,
): void {
  if (typeof window === "undefined" || !userId || userId === "anon") return;
  const history = loadPointsHistory(userId);
  const entry: PointsTransaction = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    date: new Date().toISOString(),
    ...tx,
  };
  history.unshift(entry);
  window.localStorage.setItem(HISTORY_KEY(userId), JSON.stringify(history.slice(0, 200)));
}

async function getSessionUserId(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

/** 서버 profiles.pebbles 와 동기화 후 캐시 갱신 */
export async function refreshPebblesFromServer(userId: string): Promise<number | null> {
  if (typeof window === "undefined" || !userId || userId === "anon") return null;
  try {
    const res = await fetch("/api/pebbles/balance", { credentials: "same-origin" });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; pebbles?: number };
    if (!res.ok || !j.ok || typeof j.pebbles !== "number") return null;
    savePoints(userId, j.pebbles);
    return j.pebbles;
  } catch {
    return null;
  }
}

export function setUserPoints(userId: string, nextPoints: number): void {
  if (typeof window === "undefined") return;
  savePoints(userId, Math.max(0, Math.floor(Number(nextPoints) || 0)));
}

/** 페블 소비 — 서버 반영 */
export async function spendUserPoints(
  userId: string,
  amount: number,
  description = "보트 페블 사용",
): Promise<{ ok: boolean; points: number }> {
  if (typeof window === "undefined") return { ok: false, points: 0 };
  if (isAdminUser(userId)) return { ok: true, points: ADMIN_BALANCE };
  const sid = await getSessionUserId();
  if (!sid || sid !== userId) return { ok: false, points: loadUserPoints(userId) };

  const a = Math.floor(Number(amount));
  if (!Number.isFinite(a) || a <= 0) return { ok: false, points: loadUserPoints(userId) };

  const res = await fetch("/api/pebbles/adjust", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ delta: -a, description }),
  });
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; balance?: number; error?: string };

  if (!res.ok || !j.ok || typeof j.balance !== "number") {
    return { ok: false, points: loadUserPoints(userId) };
  }

  savePoints(userId, j.balance);
  appendTransaction(userId, {
    type: "vote",
    description,
    amount: -a,
    balance: j.balance,
  });
  return { ok: true, points: j.balance };
}

/** 페블 획득 — 본인 세션이면 adjust, 타인이면 gift API */
export async function earnUserPoints(
  userId: string,
  amount: number,
  description = "페블 획득",
): Promise<number> {
  if (typeof window === "undefined") return 0;
  const a = Math.floor(Number(amount));
  if (!Number.isFinite(a) || a <= 0) return loadUserPoints(userId);

  const sid = await getSessionUserId();
  if (!sid) return loadUserPoints(userId);

  if (isAdminUser(userId)) return ADMIN_BALANCE;

  if (sid === userId) {
    const res = await fetch("/api/pebbles/adjust", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ delta: a, description }),
    });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; balance?: number };
    if (!res.ok || !j.ok || typeof j.balance !== "number") return loadUserPoints(userId);
    savePoints(userId, j.balance);
    appendTransaction(userId, {
      type: "reward",
      description,
      amount: a,
      balance: j.balance,
    });
    return j.balance;
  }

  const res = await fetch("/api/pebbles/gift", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ targetUserId: userId, amount: a, reason: description }),
  });
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; balance?: number };
  if (!res.ok || !j.ok || typeof j.balance !== "number") return loadUserPoints(userId);
  return j.balance;
}

export function useUserPointsBalance() {
  const [userId, setUserId] = useState<string>("anon");
  const [points, setPoints] = useState<number>(0);

  useEffect(() => {
    const supabase = createClient();

    const syncLocal = (uid: string) => {
      setUserId(uid);
      setPoints(loadUserPoints(uid));
    };

    const pullBalance = async (uid: string, user: import("@supabase/supabase-js").User | null) => {
      const admin = isAdminEmail(user?.email);
      if (admin) {
        setAdminFlag(uid);
        setUserId(uid);
        setPoints(ADMIN_BALANCE);
        return;
      }
      const bal = await refreshPebblesFromServer(uid);
      if (typeof bal === "number") {
        setUserId(uid);
        setPoints(bal);
        const displayName =
          user?.user_metadata?.nickname ??
          user?.user_metadata?.full_name ??
          user?.user_metadata?.name ??
          user?.email?.split("@")[0] ??
          "";
        if (displayName) {
          cacheAuthorLevel(displayName, bal);
          cacheAuthorManualLevel(displayName, getUserManualLevel(uid));
          cacheAuthorUid(displayName, uid);
        }
      } else {
        syncLocal(uid);
      }
    };

    const applySession = (uid: string, user: import("@supabase/supabase-js").User | null) => {
      if (uid !== "anon") {
        const admin = isAdminEmail(user?.email);
        const displayName =
          user?.user_metadata?.nickname ??
          user?.user_metadata?.full_name ??
          user?.user_metadata?.name ??
          user?.email?.split("@")[0] ??
          "";
        if (displayName) {
          cacheAuthorManualLevel(displayName, getUserManualLevel(uid));
          cacheAuthorUid(displayName, uid);
          if (admin) {
            registerAdminName(displayName);
          }
        }

        if (admin) {
          setAdminFlag(uid);
          setUserId(uid);
          setPoints(ADMIN_BALANCE);
          if (displayName) cacheAuthorLevel(displayName, ADMIN_BALANCE);
        } else {
          void pullBalance(uid, user);
        }
      } else {
        syncLocal(uid);
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
        if (isAdminUser(ev.detail.userId)) {
          setPoints(ADMIN_BALANCE);
          return;
        }
        setPoints(ev.detail.points);
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
