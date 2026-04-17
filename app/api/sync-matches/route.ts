import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { getTeamColor } from "@/lib/team-colors";
import {
  officialSyncedBetColumns,
  validateAdminUserId,
} from "@/lib/admin-sync-bets";

type PandaMatch = {
  id: number;
  name?: string | null;
  begin_at?: string | null;
  scheduled_at?: string | null;
  opponents?: { opponent?: { name?: string | null } | null }[] | null;
  league?: { name?: string | null } | null;
};

const CONFIRMED_AFTER_MS = 3 * 60 * 60 * 1000;

function pickBeginAt(m: PandaMatch): string | null {
  return (m.begin_at ?? m.scheduled_at ?? null) as string | null;
}

function titleFrom(m: PandaMatch): string {
  const ops = (m.opponents ?? [])
    .map((o) => o?.opponent?.name?.trim())
    .filter(Boolean) as string[];
  if (ops.length >= 2) return `${ops[0]} vs ${ops[1]}`;
  if (m.name?.trim()) return m.name.trim();
  return `PandaScore Match #${m.id}`;
}

function homeTeamName(m: PandaMatch): string {
  const ops = (m.opponents ?? [])
    .map((o) => o?.opponent?.name?.trim())
    .filter(Boolean) as string[];
  return ops[0] ?? "";
}

export async function POST() {
  try {
    const admin = validateAdminUserId();
    if (!admin.ok) {
      return NextResponse.json(
        { ok: false, errors: admin.errors },
        { status: 400 },
      );
    }

    /**
     * (임시 모크 분기)
     * - 로컬 모크 테스트를 위해 사용하던 분기입니다.
     * - 실제 데이터 재활성화 요청에 따라 현재는 비활성(주석) 상태로 보관합니다.
     *
     * if (useMockPredictionData()) {
     *   ...
     * }
     */

    const apiKey = process.env.PANDASCORE_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "Missing PANDASCORE_API_KEY" },
        { status: 400 },
      );
    }

    let res: Response;
    try {
      res = await fetch("https://api.pandascore.co/lol/matches/upcoming", {
        headers: { Authorization: `Bearer ${apiKey}` },
        next: { revalidate: 3600 },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log("[sync-matches] fetch error", msg);
      return NextResponse.json({ ok: false, error: msg }, { status: 502 });
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { ok: false, error: `PandaScore ${res.status}`, body: text },
        { status: 502 },
      );
    }

    const data = (await res.json()) as PandaMatch[];
    console.log("[sync-matches] pandascore raw", Array.isArray(data) ? data.length : 0);
    const supabase = createServiceRoleClient();
    const officialCols = officialSyncedBetColumns();

    const rows = (Array.isArray(data) ? data : [])
      .map((m) => {
        const beginAt = pickBeginAt(m);
        if (!beginAt) return null;
        const kickoffMs = new Date(beginAt).getTime();
        const confirmedAt = Number.isFinite(kickoffMs)
          ? new Date(kickoffMs + CONFIRMED_AFTER_MS).toISOString()
          : null;
        return {
          external_id: `pandascore:lol:${m.id}`,
          title: titleFrom(m),
          closing_at: beginAt,
          confirmed_at: confirmedAt,
          user_id: admin.adminUserId,
          category: "게임",
          sub_category: "LoL",
          league_id: m.league?.name?.trim() ?? null,
          status: "active" as const,
          options: ["승", "패"],
          color: getTeamColor(homeTeamName(m)),
          ...officialCols,
        };
      })
      .filter(Boolean) as any[];
    console.log("[sync-matches] rows to upsert", rows.length, "sample", rows.slice(0, 3).map((r) => r.title));

    const { error } = await supabase
      .from("bets")
      .upsert(rows, { onConflict: "external_id" });

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      count: rows.length,
      savedTitles: rows.slice(0, 20).map((r) => r.title),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

