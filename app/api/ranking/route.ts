import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { TIER_THRESHOLDS } from "@/lib/level-system";
import { isAdminUserId } from "@/lib/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = { "Cache-Control": "no-store, max-age=0" };

export interface RankingEntry {
  userId: string;
  nickname: string;
  level: number;
  pebbles: number;
  totalPoints: number;
  rank: number;
  /** 양수 = 순위 상승 (값만큼), 음수 = 하락, 0 = 동일, null = 어제 기록 없음 */
  rankChange: number | null;
}

type ProfileRow = {
  id: string;
  nickname: string | null;
  level: number | null;
  pebbles: number | null;
};

type SnapshotRow = {
  user_id: string;
  rank: number;
};

function computeTotalPoints(level: number, pebbles: number): number {
  const lvl = Math.max(1, Math.min(56, level));
  const spent = TIER_THRESHOLDS[lvl - 1] ?? 0;
  return spent + Math.max(0, pebbles);
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "100", 10) || 100));
    const myUserIdParam = searchParams.get("myUserId")?.trim() || null;

    const svc = createServiceRoleClient();

    const { data: profiles, error: profilesErr } = await svc
      .from("profiles")
      .select("id, nickname, level, pebbles");

    if (profilesErr) {
      return NextResponse.json({ ok: false, error: profilesErr.message }, { status: 500, headers: NO_STORE });
    }

    // 어드민 제외 + 총 포인트 계산
    const entries = ((profiles ?? []) as ProfileRow[])
      .filter((p) => p.id && !isAdminUserId(p.id))
      .map((p) => ({
        userId: p.id,
        nickname: p.nickname?.trim() || "익명",
        level: Math.max(1, Math.min(56, Number(p.level ?? 1))),
        pebbles: Math.max(0, Number(p.pebbles ?? 0)),
        totalPoints: computeTotalPoints(Number(p.level ?? 1), Number(p.pebbles ?? 0)),
      }))
      .sort((a, b) => b.totalPoints - a.totalPoints || a.nickname.localeCompare(b.nickname));

    // 순위 할당 (동점자 동일 순위 — 덴스 랭킹)
    let prevPoints = -1;
    let rank = 0;
    const ranked = entries.map((e, i) => {
      if (e.totalPoints !== prevPoints) {
        rank = i + 1;
        prevPoints = e.totalPoints;
      }
      return { ...e, rank };
    });

    const total = ranked.length;

    // 어제 날짜 (KST 기준 midnight = UTC+9)
    const nowKST = new Date(Date.now() + 9 * 60 * 60 * 1000);
    const yesterdayKST = new Date(nowKST);
    yesterdayKST.setDate(yesterdayKST.getDate() - 1);
    const yesterdayStr = yesterdayKST.toISOString().slice(0, 10);

    const { data: snapshots } = await svc
      .from("daily_rank_snapshots")
      .select("user_id, rank")
      .eq("snapshot_date", yesterdayStr);

    const yesterdayRankMap = new Map<string, number>();
    for (const s of ((snapshots ?? []) as SnapshotRow[])) {
      yesterdayRankMap.set(s.user_id, s.rank);
    }

    const withChange = (e: (typeof ranked)[0]): RankingEntry => {
      const yday = yesterdayRankMap.get(e.userId);
      const rankChange = yday !== undefined ? yday - e.rank : null;
      return { ...e, rankChange };
    };

    // 페이지네이션
    const offset = (page - 1) * limit;
    const pageEntries = ranked.slice(offset, offset + limit).map(withChange);

    // 내 순위 계산
    let myRank: RankingEntry | null = null;
    if (myUserIdParam) {
      const myIdx = ranked.findIndex((e) => e.userId === myUserIdParam);
      if (myIdx >= 0) {
        myRank = withChange(ranked[myIdx]);
      }
    }

    return NextResponse.json(
      { ok: true, rankings: pageEntries, total, page, limit, hasMore: offset + pageEntries.length < total, myRank },
      { headers: NO_STORE },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500, headers: NO_STORE });
  }
}
