import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { getTeamColor } from "@/lib/team-colors";
import { officialSyncedBetColumns, validateAdminUserId } from "@/lib/admin-sync-bets";
import { externalBetSyncSkippedResponse, isExternalBetSyncDisabled } from "@/lib/external-bet-sync";
import { getMockSyncBetRowsRaw, useMockPredictionData } from "@/lib/mock-prediction-data";

const CONFIRMED_AFTER_MS = 3 * 60 * 60 * 1000;

type FootballFixtureRow = {
  fixture: { id: number; date: string };
  league: { id: number; name: string; season: number };
  teams: { home: { name: string }; away: { name: string } };
};

function getSeason(): number {
  const env = process.env.FOOTBALL_API_SEASON?.trim();
  if (env && /^\d{4}$/.test(env)) return Number(env);
  const now = new Date();
  const y = now.getFullYear();
  return now.getMonth() >= 6 ? y : y - 1;
}

export async function POST() {
  try {
    const admin = validateAdminUserId();
    if (!admin.ok) {
      return NextResponse.json({ ok: false, errors: admin.errors }, { status: 400 });
    }

    if (isExternalBetSyncDisabled()) {
      return externalBetSyncSkippedResponse();
    }

    if (useMockPredictionData()) {
      const season = getSeason();
      const officialCols = officialSyncedBetColumns();
      const upsertRows = getMockSyncBetRowsRaw()
        .filter((r) => r.category === "스포츠")
        .map((r) => ({
          external_id: r.external_id,
          title: r.title,
          closing_at: r.closing_at,
          confirmed_at: r.confirmed_at,
          user_id: admin.adminUserId,
          category: r.category,
          sub_category: r.sub_category,
          league_id: r.league_id,
          status: "active" as const,
          color: r.color,
          options: r.options,
          ...officialCols,
        }));
      const supabase = createServiceRoleClient();
      const { error } = await supabase
        .from("bets")
        .upsert(upsertRows, { onConflict: "external_id" });
      if (error) {
        return NextResponse.json({ ok: false, error: error.message, code: error.code, _mock: true }, { status: 500 });
      }
      return NextResponse.json({ ok: true, count: upsertRows.length, season, _mock: true });
    }

    const apiKey = process.env.FOOTBALL_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json({ ok: false, error: "Missing FOOTBALL_API_KEY" }, { status: 400 });
    }

    const season = getSeason();
    const url = `https://v3.football.api-sports.io/fixtures?league=39&season=${season}`;
    const res = await fetch(url, {
      headers: { "x-apisports-key": apiKey },
      next: { revalidate: 3600 },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json({ ok: false, error: `API-Football ${res.status}`, body: text }, { status: 502 });
    }
    const json = await res.json();
    const rows = (Array.isArray(json?.response) ? json.response : []) as FootballFixtureRow[];

    const officialCols = officialSyncedBetColumns();
    const upsertRows = rows.map((r) => {
      const kickoffISO = r.fixture.date;
      const kickoffMs = new Date(kickoffISO).getTime();
      const confirmedAt = Number.isFinite(kickoffMs)
        ? new Date(kickoffMs + CONFIRMED_AFTER_MS).toISOString()
        : null;
      const home = r.teams.home.name?.trim() ?? "";
      const away = r.teams.away.name?.trim() ?? "";
      return {
        external_id: `football:39:${r.fixture.id}`,
        title: `${home} vs ${away}`,
        closing_at: kickoffISO,
        confirmed_at: confirmedAt,
        user_id: admin.adminUserId,
        category: "스포츠",
        sub_category: "해외축구",
        league_id: String(r.league?.id ?? 39),
        status: "active" as const,
        color: getTeamColor(home),
        options: ["승", "무", "패"],
        ...officialCols,
      };
    });

    const supabase = createServiceRoleClient();
    const { error } = await supabase
      .from("bets")
      .upsert(upsertRows, { onConflict: "external_id" });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message, code: error.code }, { status: 500 });
    }

    return NextResponse.json({ ok: true, count: upsertRows.length, season });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

