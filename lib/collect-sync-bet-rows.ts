import { getTeamColor } from "@/lib/team-colors";
import { isExternalBetSyncDisabled } from "@/lib/external-bet-sync";
import {
  officialSyncedBetColumns,
  validateAdminUserId,
} from "@/lib/admin-sync-bets";

export const KICKOFF_WINDOW_MS = 72 * 60 * 60 * 1000; // 72h
export const CONFIRMED_AFTER_MS = 3 * 60 * 60 * 1000; // +3h

const PANDASCORE_BASE = "https://api.pandascore.co";
const FOOTBALL_BASE = "https://v3.football.api-sports.io";
const FETCH_TIMEOUT_MS = 12_000;

/**
 * LoL은 PandaScore에 리그가 너무 많아 UI가 과밀해질 수 있어
 * LCK 등 일부 리그만 허용합니다. (데이터 가공 로직 유지)
 */
const ALLOWED_LOL_LEAGUES = new Set<string>([
  "LCK",
  "LCK Challengers League",
  "LCK CL",
  // 1군 리그(주요 지역)
  "LPL",
  "LEC",
  "LCS",
]);

// PandaScore: game sources we use
const PANDASCORE_SOURCES = [
  { path: "/lol/matches/upcoming", category: "게임", subCategory: "LoL" },
] as const;

// API-Football: european top leagues
const TOP_LEAGUES = [
  { leagueId: 39, name: "EPL", category: "스포츠", subCategory: "해외축구" }, // Premier League
  { leagueId: 140, name: "LaLiga", category: "스포츠", subCategory: "해외축구" },
  { leagueId: 135, name: "SerieA", category: "스포츠", subCategory: "해외축구" },
  { leagueId: 78, name: "Bundesliga", category: "스포츠", subCategory: "해외축구" },
  { leagueId: 61, name: "Ligue1", category: "스포츠", subCategory: "해외축구" },
  // UEFA
  { leagueId: 2, name: "UCL", category: "스포츠", subCategory: "해외축구" }, // Champions League
  { leagueId: 3, name: "UEL", category: "스포츠", subCategory: "해외축구" }, // Europa League
] as const;

export type PandaMatch = {
  id: number;
  name?: string | null;
  begin_at?: string | null;
  scheduled_at?: string | null;
  opponents?: { opponent?: { name?: string | null } | null }[] | null;
  league?: { name?: string | null } | null;
};

export type ApiFootballFixtureRow = {
  fixture: { id: number; date: string };
  league: { id: number; name: string; season: number };
  teams: {
    home: { name: string };
    away: { name: string };
  };
};

export type SyncBetRowInsert = {
  external_id: string;
  title: string;
  closing_at: string;
  confirmed_at: string | null;
  user_id: string;
  category: string;
  sub_category: string | null;
  league_id: string | null;
  status: "active";
  color: string | null;
  options: string[];
  is_admin_generated: boolean;
  author_name: string | null;
};

export function validateRequiredSyncEnv():
  | { ok: true; adminUserId: string }
  | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const panda = process.env.PANDASCORE_API_KEY?.trim();
  const football = process.env.FOOTBALL_API_KEY?.trim();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const srk = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!panda) errors.push("PANDASCORE_API_KEY가 필요합니다.");
  if (!football) errors.push("FOOTBALL_API_KEY가 필요합니다.");
  if (!url) errors.push("NEXT_PUBLIC_SUPABASE_URL이 필요합니다.");
  if (!srk) errors.push("SUPABASE_SERVICE_ROLE_KEY가 필요합니다.");

  const admin = validateAdminUserId();
  if (!admin.ok) errors.push(...admin.errors);
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, adminUserId: admin.adminUserId };
}

function pickBeginAtPanda(m: PandaMatch): string | null {
  return (m.begin_at ?? m.scheduled_at ?? null) as string | null;
}

function titleFromPanda(m: PandaMatch): string {
  const ops = (m.opponents ?? [])
    .map((o) => o?.opponent?.name?.trim())
    .filter(Boolean) as string[];
  if (ops.length >= 2) return `${ops[0]} vs ${ops[1]}`;
  if (m.name?.trim()) return m.name.trim();
  return `PandaScore Match #${m.id}`;
}

function homeTeamNamePanda(m: PandaMatch): string {
  const ops = (m.opponents ?? [])
    .map((o) => o?.opponent?.name?.trim())
    .filter(Boolean) as string[];
  return ops[0] ?? "";
}

function leagueNamePanda(m: PandaMatch): string {
  return m.league?.name?.trim() ?? "";
}

function shouldIncludePandaMatch(srcPath: string, m: PandaMatch): boolean {
  // LoL만 LCK 계열 제한 (요청된 필터링 유지)
  if (srcPath.includes("/lol/")) {
    const league = leagueNamePanda(m);
    return league ? ALLOWED_LOL_LEAGUES.has(league) : false;
  }
  return true;
}

function classifyKickoff(nowMs: number, kickoffISO: string): {
  inWindow: boolean;
  kickoffMs: number;
  reason: "ok" | "started" | "too_far" | "invalid";
} {
  const kickoffMs = new Date(kickoffISO).getTime();
  if (!Number.isFinite(kickoffMs)) return { inWindow: false, kickoffMs: nowMs, reason: "invalid" };
  const diff = kickoffMs - nowMs;
  if (diff < 0) return { inWindow: false, kickoffMs, reason: "started" };
  if (diff > KICKOFF_WINDOW_MS) return { inWindow: false, kickoffMs, reason: "too_far" };
  return { inWindow: true, kickoffMs, reason: "ok" };
}

function hasFootballApiErrors(json: any): boolean {
  const err = json?.errors;
  if (!err) return false;
  if (Array.isArray(err)) return err.length > 0;
  if (typeof err === "object") return Object.keys(err).length > 0;
  return false;
}

async function fetchWithTimeout(input: RequestInfo, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

export function getFootballSeason(now = new Date()): number {
  const env = process.env.FOOTBALL_API_SEASON?.trim();
  if (env && /^\d{4}$/.test(env)) return Number(env);
  // 축구 시즌은 대개 하반기 시작 → 7월 기준으로 시즌 판단
  const y = now.getFullYear();
  const m = now.getMonth(); // 0-based
  return m >= 6 ? y : y - 1;
}

async function fetchPandaUpcoming(apiKey: string, path: string): Promise<PandaMatch[]> {
  const res = await fetchWithTimeout(`${PANDASCORE_BASE}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    next: { revalidate: 3600 },
  }, FETCH_TIMEOUT_MS);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`PandaScore ${path} ${res.status}: ${text}`.trim());
  }
  const data = (await res.json()) as unknown;
  return Array.isArray(data) ? (data as PandaMatch[]) : [];
}

async function fetchFootballLeague(
  apiKey: string,
  leagueId: number,
  season: number,
): Promise<ApiFootballFixtureRow[]> {
  const url = new URL(`${FOOTBALL_BASE}/fixtures`);
  url.searchParams.set("league", String(leagueId));
  url.searchParams.set("season", String(season));

  const res = await fetchWithTimeout(url.toString(), {
    headers: { "x-apisports-key": apiKey },
    next: { revalidate: 3600 },
  }, FETCH_TIMEOUT_MS);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`API-Football league=${leagueId} ${res.status}: ${text}`.trim());
  }
  const json = await res.json();
  if (hasFootballApiErrors(json)) {
    throw new Error(`API-Football errors: ${JSON.stringify(json.errors)}`);
  }
  const rows = json?.response;
  return Array.isArray(rows) ? (rows as ApiFootballFixtureRow[]) : [];
}

export async function collectSyncBetRows(nowMs = Date.now()): Promise<{
  ok: boolean;
  errors: string[];
  rows: SyncBetRowInsert[];
  excluded: {
    pandascore_too_far: number;
    pandascore_already_started: number;
    football_too_far: number;
    football_already_started: number;
    total_sources: number;
  };
}> {
  /**
   * (임시 모크 분기)
   * - 로컬 모크 테스트를 위해 사용하던 분기입니다.
   * - 실제 API 재활성화 요청에 따라 현재는 비활성(주석) 상태로 보관합니다.
   *
   * if (useMockPredictionData()) {
   *   ...
   * }
   */

  if (isExternalBetSyncDisabled()) {
    return {
      ok: true,
      errors: [],
      rows: [],
      excluded: {
        pandascore_too_far: 0,
        pandascore_already_started: 0,
        football_too_far: 0,
        football_already_started: 0,
        total_sources: 0,
      },
    };
  }

  const errors: string[] = [];
  const envOk = validateRequiredSyncEnv();
  if (!envOk.ok) {
    return {
      ok: false,
      errors: envOk.errors,
      rows: [],
      excluded: {
        pandascore_too_far: 0,
        pandascore_already_started: 0,
        football_too_far: 0,
        football_already_started: 0,
        total_sources: 0,
      },
    };
  }

  const pandaKey = process.env.PANDASCORE_API_KEY!.trim();
  const footballKey = process.env.FOOTBALL_API_KEY!.trim();
  const adminUserId = envOk.adminUserId;
  const season = getFootballSeason(new Date(nowMs));
  const officialCols = officialSyncedBetColumns();

  const byExternalId = new Map<string, SyncBetRowInsert>();
  let excludedPandaTooFar = 0;
  let excludedPandaStarted = 0;
  let excludedFootballTooFar = 0;
  let excludedFootballStarted = 0;
  let excludedPandaByLeague = 0;
  const debugCounts = {
    panda_raw: 0,
    panda_kept: 0,
    football_raw: 0,
    football_kept: 0,
  };

  const pandaPromises = PANDASCORE_SOURCES.map(async (src) => {
    const list = await fetchPandaUpcoming(pandaKey, src.path);
    debugCounts.panda_raw += list.length;
    for (const m of list) {
      if (!shouldIncludePandaMatch(src.path, m)) {
        excludedPandaByLeague += 1;
        continue;
      }
      const beginAt = pickBeginAtPanda(m);
      if (!beginAt) continue;
      const k = classifyKickoff(nowMs, beginAt);
      if (!k.inWindow) {
        if (k.reason === "started") excludedPandaStarted += 1;
        else if (k.reason === "too_far") excludedPandaTooFar += 1;
        continue;
      }
      const title = titleFromPanda(m);
      const externalId = `pandascore:${src.path}:${m.id}`;
      byExternalId.set(externalId, {
        external_id: externalId,
        title,
        closing_at: beginAt,
        confirmed_at: new Date(k.kickoffMs + CONFIRMED_AFTER_MS).toISOString(),
        user_id: adminUserId,
        category: src.category,
        sub_category: src.subCategory,
        league_id: m.league?.name?.trim() ?? null,
        status: "active",
        color: getTeamColor(homeTeamNamePanda(m)),
        options: ["승", "패"],
        ...officialCols,
      });
      debugCounts.panda_kept += 1;
    }
  });

  const footballPromises = TOP_LEAGUES.map(async (l) => {
    const rows = await fetchFootballLeague(footballKey, l.leagueId, season);
    debugCounts.football_raw += rows.length;
    for (const r of rows) {
      const kickoffISO = r.fixture?.date;
      if (!kickoffISO) continue;
      const k = classifyKickoff(nowMs, kickoffISO);
      if (!k.inWindow) {
        if (k.reason === "started") excludedFootballStarted += 1;
        else if (k.reason === "too_far") excludedFootballTooFar += 1;
        continue;
      }
      const home = r.teams?.home?.name?.trim() ?? "";
      const away = r.teams?.away?.name?.trim() ?? "";
      const title = home && away ? `${home} vs ${away}` : `Fixture #${r.fixture.id}`;
      const externalId = `football:${l.leagueId}:${r.fixture.id}`;
      byExternalId.set(externalId, {
        external_id: externalId,
        title,
        closing_at: kickoffISO,
        confirmed_at: new Date(k.kickoffMs + CONFIRMED_AFTER_MS).toISOString(),
        user_id: adminUserId,
        category: l.category,
        sub_category: l.subCategory,
        league_id: String(r.league?.id ?? l.leagueId),
        status: "active",
        color: getTeamColor(home),
        options: ["승", "무", "패"],
        ...officialCols,
      });
      debugCounts.football_kept += 1;
    }
  });

  const all = await Promise.allSettled([...pandaPromises, ...footballPromises]);
  for (const r of all) {
    if (r.status === "rejected") errors.push(String(r.reason?.message ?? r.reason));
  }

  const out = [...byExternalId.values()];
  console.log("[collect-sync-bet-rows]", {
    season,
    debugCounts,
    excludedPandaByLeague,
    excludedPandaStarted,
    excludedPandaTooFar,
    excludedFootballStarted,
    excludedFootballTooFar,
    totalUnique: out.length,
    errors: errors.length,
  });
  return {
    ok: errors.length === 0,
    errors,
    rows: out,
    excluded: {
      pandascore_too_far: excludedPandaTooFar,
      pandascore_already_started: excludedPandaStarted,
      football_too_far: excludedFootballTooFar,
      football_already_started: excludedFootballStarted,
      total_sources: PANDASCORE_SOURCES.length + TOP_LEAGUES.length,
    },
  };
}

