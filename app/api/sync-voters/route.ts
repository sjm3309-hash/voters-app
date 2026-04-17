import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { getTeamColor } from "@/lib/team-colors";
import { officialSyncedBetColumns, validateAdminUserId } from "@/lib/admin-sync-bets";

const LOG = "[sync-voters]";
const CONFIRMED_AFTER_MS = 3 * 60 * 60 * 1000;

function requireCronAuth(request: Request): NextResponse | null {
  // 로컬/개발 환경에서는 테스트 편의상 우회
  if (process.env.NODE_ENV === "development") return null;

  const expected = process.env.CRON_SECRET?.trim();
  const provided = request.headers.get("authorization")?.trim();

  if (!expected) {
    console.log(LOG, "auth:missing_env", "CRON_SECRET");
    return NextResponse.json(
      { success: false, error: "Missing CRON_SECRET env" },
      { status: 500 },
    );
  }

  if (!provided || provided !== expected) {
    console.log(LOG, "auth:unauthorized", { hasAuthHeader: Boolean(provided) });
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }

  return null;
}

type PandaMatch = {
  id: number;
  name?: string | null;
  begin_at?: string | null;
  scheduled_at?: string | null;
  opponents?: { opponent?: { name?: string | null } | null }[] | null;
  league?: { name?: string | null } | null;
};

function pickLolSubCategory(m: PandaMatch): "LoL" | "발로란트" {
  const league = (m.league?.name ?? "").toLowerCase();
  const name = (m.name ?? "").toLowerCase();
  if (league.includes("valorant") || name.includes("valorant")) return "발로란트";
  return "LoL";
}

function formatTeamName(raw: string): string {
  const s = raw.trim();
  if (!s) return s;

  // 접두/접미 수식어 제거 후 매핑 시도 (FC/CF/AFC 등)
  const cleaned = s
    .replace(/\b(fc|cf|afc|c\.f\.|f\.c\.|a\.f\.c\.)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  const key = cleaned.toLowerCase();

  const table: { keys: string[]; label: string }[] = [
    // ── e스포츠 (LCK) ───────────────────────────────────────────────
    { keys: ["dplus kia", "dk"], label: "디플러스 기아" },
    { keys: ["t1"], label: "T1" },
    { keys: ["gen.g", "gen"], label: "젠지" },
    { keys: ["hanwha life esports", "hle"], label: "한화생명e스포츠" },
    { keys: ["kt rolster", "kt"], label: "KT 롤스터" },
    { keys: ["kwangdong freecs", "kdf"], label: "광동 프릭스" },
    { keys: ["bnk fearx", "fox"], label: "BNK 피어엑스" },
    { keys: ["drx"], label: "DRX" },
    { keys: ["oksavingsbank brion", "bro"], label: "OK저축은행 브리온" },
    { keys: ["nongshim redforce", "ns"], label: "농심 레드포스" },

    // ── 해외 축구 (EPL) ────────────────────────────────────────────
    { keys: ["manchester city", "man city"], label: "맨시티" },
    { keys: ["arsenal"], label: "아스널" },
    { keys: ["liverpool"], label: "리버풀" },
    { keys: ["aston villa"], label: "아스톤 빌라" },
    { keys: ["tottenham", "tottenham hotspur", "spurs"], label: "토트넘" },
    { keys: ["manchester united", "man united", "man utd"], label: "맨유" },
    { keys: ["newcastle", "newcastle united"], label: "뉴캐슬" },
    { keys: ["chelsea"], label: "첼시" },
    { keys: ["brighton", "brighton hove albion"], label: "브라이튼" },
    { keys: ["west ham", "west ham united"], label: "웨스트햄" },

    // ── La Liga ────────────────────────────────────────────────────
    { keys: ["real madrid"], label: "레알 마드리드" },
    { keys: ["barcelona"], label: "바르셀로나" },
    { keys: ["atletico madrid", "atlético madrid", "atletico"], label: "AT 마드리드" },
    { keys: ["girona"], label: "지로나" },
    { keys: ["athletic club", "athletic bilbao"], label: "빌바오" },
    { keys: ["real sociedad"], label: "소시에다드" },

    // ── Bundesliga ─────────────────────────────────────────────────
    { keys: ["bayern munich", "fc bayern", "bayern"], label: "바이에른 뮌헨" },
    { keys: ["bayer leverkusen", "leverkusen"], label: "레버쿠젠" },
    { keys: ["dortmund", "borussia dortmund", "bvb"], label: "도르트문트" },
    { keys: ["rb leipzig", "leipzig"], label: "라이프치히" },
    { keys: ["stuttgart", "vfb stuttgart"], label: "슈투트가르트" },

    // ── Serie A ────────────────────────────────────────────────────
    { keys: ["inter", "inter milan", "internazionale"], label: "인터 밀란" },
    { keys: ["ac milan", "milan"], label: "AC 밀란" },
    { keys: ["juventus", "juve"], label: "유벤투스" },
    { keys: ["as roma", "roma"], label: "AS 로마" },
    { keys: ["napoli"], label: "나폴리" },
    { keys: ["lazio"], label: "라치오" },

    // ── Ligue 1 ────────────────────────────────────────────────────
    { keys: ["paris saint germain", "psg", "paris sg"], label: "PSG" },
    { keys: ["monaco", "as monaco"], label: "모나코" },
    { keys: ["nice", "ogc nice"], label: "니스" },
    { keys: ["lille", "lille osc"], label: "릴" },
  ];
  for (const row of table) {
    for (const k of row.keys) {
      if (key === k) return row.label;
    }
  }
  // 부분 일치도 허용 (예: "Gen.G Esports" 등)
  for (const row of table) {
    for (const k of row.keys) {
      if (key.includes(k)) return row.label;
    }
  }
  return cleaned;
}

type FootballFixtureRow = {
  fixture: { id: number; date: string; status?: { short?: string } };
  league: { id: number; name: string; season?: number };
  teams: { home: { name: string }; away: { name: string } };
};

type BetUpsertRow = {
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

function listMissingEnvKeys(): string[] {
  const keys = [
    "ADMIN_USER_ID",
    "PANDASCORE_API_KEY",
    "FOOTBALL_API_KEY",
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
  ] as const;
  const missing: string[] = [];
  for (const k of keys) {
    const v = process.env[k];
    if (!v || !String(v).trim()) missing.push(k);
  }
  return missing;
}

function pickBeginAtPanda(m: PandaMatch): string | null {
  return (m.begin_at ?? m.scheduled_at ?? null) as string | null;
}

function titleFromPanda(m: PandaMatch): string {
  const ops = (m.opponents ?? [])
    .map((o) => o?.opponent?.name?.trim())
    .filter(Boolean) as string[];
  if (ops.length >= 2) {
    const home = formatTeamName(ops[0] ?? "");
    const away = formatTeamName(ops[1] ?? "");
    return `${home} vs ${away}`;
  }
  if (m.name?.trim()) return m.name.trim();
  return `PandaScore Match #${m.id}`;
}

function homeTeamPanda(m: PandaMatch): string {
  const ops = (m.opponents ?? [])
    .map((o) => o?.opponent?.name?.trim())
    .filter(Boolean) as string[];
  return ops[0] ?? "";
}

function ymdUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function buildNext3DatesUTC(now = new Date()): string[] {
  const out: string[] = [];
  for (let i = 0; i < 3; i += 1) {
    const t = new Date(now);
    t.setUTCDate(t.getUTCDate() + i);
    out.push(ymdUTC(t));
  }
  return out;
}

async function fetchSafely(apiName: string, url: string, init: RequestInit) {
  console.log(LOG, "fetch:start", { api: apiName, url });
  try {
    const res = await fetch(url, init);
    const ok200 = res.status === 200;
    console.log(LOG, "fetch:done", { api: apiName, url, status: res.status, ok: ok200 });
    if (!ok200) {
      const body = await res.text().catch(() => "");
      console.error(`${LOG} api_error`, {
        api: apiName,
        url,
        status: res.status,
        body,
      });
    }
    return { ok: true as const, res };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`${LOG} fetch_error`, { api: apiName, url, message });
    return { ok: false as const, error: message };
  }
}

async function runSyncVoters(request: Request, requestMethod: "GET" | "POST") {
  const nowISO = new Date().toISOString();
  console.log(LOG, "start", { method: requestMethod, nowISO });

  const auth = requireCronAuth(request);
  if (auth) return auth;

  const missing = listMissingEnvKeys();
  const admin = validateAdminUserId();
  if (missing.length > 0 || !admin.ok) {
    const errors = [
      ...(missing.length > 0 ? [`missing_env: ${missing.join(", ")}`] : []),
      ...(!admin.ok ? admin.errors : []),
    ];
    console.log(LOG, "env invalid", errors);
    return NextResponse.json(
      { success: false, errors, missing },
      { status: 400 },
    );
  }

  const pandaKey = process.env.PANDASCORE_API_KEY!.trim();
  const footballKey = process.env.FOOTBALL_API_KEY!.trim();
  const officialCols = officialSyncedBetColumns();

  console.log(LOG, "env ok", {
    adminUserId: admin.adminUserId,
    hasPandaKey: Boolean(pandaKey),
    hasFootballKey: Boolean(footballKey),
  });

  // 2) 데이터 수집 조건 완화: 시간 필터 해제 (upcoming 그대로 저장)
  // LCK 중심: leagueId=293 (LCK)
  const pandaUrl = "https://api.pandascore.co/leagues/293/matches/upcoming";
  const dates = buildNext3DatesUTC(new Date());
  const footballDates = dates;
  const footballLeagueAllow = new Set<number>([39, 140, 135, 78, 61, 2, 3]);
  const footballUrls = footballDates.map(
    (d) => `https://v3.football.api-sports.io/fixtures?date=${d}`,
  );
  console.log(LOG, "football:dates", { footballDates });

  const [pandaFetch, footballFetches] = await Promise.all([
    fetchSafely("pandascore", pandaUrl, {
      headers: {
        Authorization: `Bearer ${pandaKey}`,
        Accept: "application/json",
      },
      next: { revalidate: 3600 },
    }),
    Promise.allSettled(
      footballUrls.map((url) =>
        fetchSafely("api-football", url, {
          headers: {
            "x-apisports-key": footballKey,
            Accept: "application/json",
          },
          next: { revalidate: 3600 },
        }),
      ),
    ),
  ]);

  const apiErrors: any[] = [];
  const byExternalId = new Map<string, BetUpsertRow>();

  // PandaScore
  if (pandaFetch.ok) {
    const res = pandaFetch.res;
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      apiErrors.push({ source: "pandascore", status: res.status, body });
      console.log(LOG, "pandascore:not_ok", { status: res.status, body: body.slice(0, 500) });
    } else {
      const json = (await res.json().catch(() => null)) as unknown;
      const list = Array.isArray(json) ? (json as PandaMatch[]) : [];
      console.log(LOG, "pandascore:lck:count", { count: list.length });

      // upcoming이 너무 적으면 filter[league_id]=293로 보강 수집
      let finalList = list;
      if (finalList.length < 3) {
        const fallbackUrl = "https://api.pandascore.co/lol/matches?filter[league_id]=293";
        console.log(LOG, "pandascore:fallback:try", { url: fallbackUrl });
        const fb = await fetchSafely("pandascore", fallbackUrl, {
          headers: {
            Authorization: `Bearer ${pandaKey}`,
            Accept: "application/json",
          },
          next: { revalidate: 3600 },
        });
        if (fb.ok) {
          const fbRes = fb.res;
          if (!fbRes.ok) {
            const body = await fbRes.text().catch(() => "");
            apiErrors.push({ source: "pandascore_fallback", status: fbRes.status, body });
          } else {
            const fbJson = (await fbRes.json().catch(() => null)) as unknown;
            const fbList = Array.isArray(fbJson) ? (fbJson as PandaMatch[]) : [];
            console.log(LOG, "pandascore:fallback:count", { count: fbList.length });
            if (fbList.length > finalList.length) finalList = fbList;
          }
        } else {
          apiErrors.push({ source: "pandascore_fallback", error: fb.error });
        }
      }

      for (const m of finalList) {
        const beginAt = pickBeginAtPanda(m);
        if (!beginAt) continue;
        const kickoffMs = new Date(beginAt).getTime();
        const confirmedAt = Number.isFinite(kickoffMs)
          ? new Date(kickoffMs + CONFIRMED_AFTER_MS).toISOString()
          : null;
        const subCategory = pickLolSubCategory(m);
        const externalId = `pandascore:lol:${m.id}`;
        byExternalId.set(externalId, {
          external_id: externalId,
          title: titleFromPanda(m),
          closing_at: beginAt,
          confirmed_at: confirmedAt,
          user_id: admin.adminUserId,
          category: "게임",
          sub_category: subCategory,
          league_id: m.league?.name?.trim() ?? null,
          status: "active",
          color: getTeamColor(homeTeamPanda(m)),
          options: ["승", "패"],
          is_admin_generated: true,
          ...officialCols,
        });
      }
    }
  } else {
    apiErrors.push({ source: "pandascore", error: pandaFetch.error });
  }

  // API-Football (무료 플랜 우회: date 기반)
  const mergedFootball: FootballFixtureRow[] = [];
  for (let i = 0; i < footballFetches.length; i += 1) {
    const settled = footballFetches[i];
    const date = footballDates[i] ?? "unknown";
    if (!settled) continue;
    if (settled.status === "rejected") {
      apiErrors.push({ source: "football", date, error: String(settled.reason) });
      console.log(LOG, "football:date:rejected", { date, reason: String(settled.reason) });
      continue;
    }
    const fetched = settled.value;
    if (!fetched.ok) {
      apiErrors.push({ source: "football", date, error: fetched.error });
      continue;
    }
    const res = fetched.res;
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      apiErrors.push({ source: "football", date, status: res.status, body });
      console.log(LOG, "football:date:not_ok", { date, status: res.status, body: body.slice(0, 500) });
      continue;
    }
    const json = (await res.json().catch(() => null)) as any;
    const rows = Array.isArray(json?.response) ? (json.response as FootballFixtureRow[]) : [];
    console.log(LOG, "football:date:count", { date, count: rows.length });
    mergedFootball.push(...rows);
  }

  console.log(LOG, "football:merged", { count: mergedFootball.length });

  const filteredFootball = mergedFootball.filter((fx) => {
    const short = fx.fixture?.status?.short ?? "";
    const leagueId = fx.league?.id;
    return short === "NS" && typeof leagueId === "number" && footballLeagueAllow.has(leagueId);
  });
  console.log(LOG, "football:filtered", { count: filteredFootball.length });

  for (const fx of filteredFootball) {
    const kickoffISO = fx.fixture?.date;
    if (!kickoffISO) continue;
    const kickoffMs = new Date(kickoffISO).getTime();
    const confirmedAt = Number.isFinite(kickoffMs)
      ? new Date(kickoffMs + CONFIRMED_AFTER_MS).toISOString()
      : null;
    const homeRaw = fx.teams?.home?.name?.trim() ?? "";
    const awayRaw = fx.teams?.away?.name?.trim() ?? "";
    const home = formatTeamName(homeRaw);
    const away = formatTeamName(awayRaw);
    const title = home && away ? `${home} vs ${away}` : `Fixture #${fx.fixture.id}`;
    // 요구사항: external_id는 fixture.id 기반
    const externalId = String(fx.fixture.id);
    byExternalId.set(externalId, {
      external_id: externalId,
      title,
      closing_at: kickoffISO,
      confirmed_at: confirmedAt,
      user_id: admin.adminUserId,
      category: "스포츠",
      sub_category: "해외축구",
      league_id: String(fx.league?.id ?? ""),
      status: "active",
      color: getTeamColor(homeRaw || home),
      options: [
        home ? `홈 ${home} 승` : "홈 승",
        "무승부",
        away ? `어웨이 ${away} 승` : "어웨이 팀 승",
      ],
      ...officialCols,
    });
  }

  const rows = [...byExternalId.values()];
  console.log(LOG, "collect:done", { uniqueRows: rows.length, apiErrors: apiErrors.length });

  // 3) Supabase 저장 로직 보강: 데이터가 1개라도 있으면 무조건 저장 시도
  if (rows.length === 0) {
    return NextResponse.json(
      {
        success: false,
        error: "No rows collected from upstream APIs",
        apiErrors,
      },
      { status: 502 },
    );
  }

  let supabase: ReturnType<typeof createServiceRoleClient>;
  try {
    supabase = createServiceRoleClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(LOG, "supabase:create:error", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }

  console.log(LOG, "db:upsert:start", {
    rows: rows.length,
    sample: rows.slice(0, 5).map((r) => ({
      external_id: r.external_id,
      title: r.title,
      closing_at: r.closing_at,
      user_id: r.user_id,
      category: r.category,
      sub_category: r.sub_category,
      color: r.color,
    })),
  });

  const { data, error } = await supabase
    .from("bets")
    .upsert(rows, { onConflict: "external_id" })
    .select("title");

  if (error) {
    console.log(LOG, "db:upsert:error", error);
    return NextResponse.json(
      { success: false, error, apiErrors },
      { status: 500 },
    );
  }

  const savedTitles = (data ?? []).map((r: any) => r?.title).filter(Boolean);
  console.log(LOG, "db:upsert:done", { saved: savedTitles.length });

  return NextResponse.json({
    success: true,
    saved: savedTitles.length,
    details: savedTitles,
    apiErrors,
  });
}

export async function GET(request: Request) {
  try {
    return await runSyncVoters(request, "GET");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(LOG, "fatal", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    return await runSyncVoters(request, "POST");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(LOG, "fatal", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

