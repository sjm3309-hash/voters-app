import { NextResponse } from "next/server";
import { requireAdminJson } from "@/app/api/admin/_auth";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { TIER_THRESHOLDS } from "@/lib/level-system";
import { isAdminUserId } from "@/lib/admin";

type ProfileRow = { id: string; level: number | null; pebbles: number | null };

function computeTotalPoints(level: number, pebbles: number): number {
  const lvl = Math.max(1, Math.min(56, level));
  return (TIER_THRESHOLDS[lvl - 1] ?? 0) + Math.max(0, pebbles);
}

/**
 * POST /api/ranking/snapshot
 * 현재 순위를 오늘 날짜로 스냅샷 저장 (어드민 전용).
 * pg_cron 없이도 운영자가 매일 자정 전후에 호출하거나,
 * Supabase Edge Function cron으로 자동화할 수 있습니다.
 */
export async function POST() {
  const gate = await requireAdminJson();
  if (!gate.ok) return gate.response;

  try {
    const svc = createServiceRoleClient();

    const { data: profiles, error } = await svc
      .from("profiles")
      .select("id, level, pebbles");

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const entries = ((profiles ?? []) as ProfileRow[])
      .filter((p) => p.id && !isAdminUserId(p.id))
      .map((p) => ({
        userId: p.id,
        totalPoints: computeTotalPoints(Number(p.level ?? 1), Number(p.pebbles ?? 0)),
      }))
      .sort((a, b) => b.totalPoints - a.totalPoints);

    let prevPoints = -1;
    let rank = 0;
    const ranked = entries.map((e, i) => {
      if (e.totalPoints !== prevPoints) { rank = i + 1; prevPoints = e.totalPoints; }
      return { user_id: e.userId, rank, total_points: e.totalPoints };
    });

    // KST 오늘 날짜
    const todayKST = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

    const rows = ranked.map((r) => ({
      snapshot_date: todayKST,
      user_id: r.user_id,
      rank: r.rank,
      total_points: r.total_points,
    }));

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, snapshotDate: todayKST, saved: 0 });
    }

    const { error: upsertErr } = await svc
      .from("daily_rank_snapshots")
      .upsert(rows, { onConflict: "snapshot_date,user_id" });

    if (upsertErr) {
      return NextResponse.json({ ok: false, error: upsertErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, snapshotDate: todayKST, saved: rows.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
