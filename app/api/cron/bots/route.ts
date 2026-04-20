/**
 * GET /api/cron/bots
 *
 * 봇 일일 활동 cron (Vercel Cron Jobs 에서 호출)
 *
 * 스케줄:
 *   - 오전 세션  "0 0 * * *"   (KST 09:00)
 *   - 오후 세션  "0 6 * * *"   (KST 15:00)
 *   - 저녁 세션  "0 11 * * *"  (KST 20:00)
 *
 * 봇 성향별 행동 규칙:
 *   - 과감형(checkin_interval_days=1) : 매일 활동, 잔고의 55~75% 베팅, 3~4개 보트
 *   - 안정형(checkin_interval_days=2~3): 간격 충족 시 활동, 잔고의 20~40% 베팅, 2~3개 보트
 *   - 평범형(checkin_interval_days=1~2): 간격 충족 시 활동, 잔고의 8~25% 베팅, 1~3개 보트
 *
 * 출석 보상: 활동 시 100P 자동 지급 (베팅 재원 확보)
 */
import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

const LOG = "[cron/bots]";

// ── 봇 정의 ─────────────────────────────────────────────────────────────────
const BOTS = [
  { id: "afa07fb5-9bfb-4036-ac17-4bc6560c1dd0", nickname: "한숨제조기", style: "과감형" as const, checkinDays: 1 },
  { id: "57aceac9-0930-455e-8bca-463ae50c29e9", nickname: "썬망",       style: "과감형" as const, checkinDays: 1 },
  { id: "7ccd4f36-d67e-4ac2-bdfe-15639937482d", nickname: "쿄쥬로",     style: "안정형" as const, checkinDays: 2 },
  { id: "240553e7-e0d1-46c6-a029-a11b1fda2878", nickname: "볼란티스",   style: "안정형" as const, checkinDays: 2 },
  { id: "bef89655-aa67-4e01-af6e-8d7cf6fa36b2", nickname: "가슴사슴",   style: "안정형" as const, checkinDays: 3 },
  { id: "f7be7cb4-0c0a-47b6-94e5-1c9403147956", nickname: "징징바",     style: "평범형" as const, checkinDays: 1 },
  { id: "51cc3773-104f-4a4b-a364-bedde59fd718", nickname: "총배설강",   style: "평범형" as const, checkinDays: 2 },
  { id: "0e76fcdd-de97-40c0-a876-d9fb7486ff67", nickname: "진짜대통령", style: "평범형" as const, checkinDays: 1 },
  { id: "9a385c48-3c11-4696-bb67-5480b6195e17", nickname: "김도시락",   style: "평범형" as const, checkinDays: 2 },
  { id: "4e4eea03-4085-4ae0-909e-e388a68b8378", nickname: "빌애크먼",   style: "평범형" as const, checkinDays: 2 },
] as const;

type Style = "과감형" | "안정형" | "평범형";

// ── 성향별 전략 ───────────────────────────────────────────────────────────────
const STRATEGY: Record<Style, { minRatio: number; maxRatio: number; minM: number; maxM: number }> = {
  과감형: { minRatio: 0.55, maxRatio: 0.75, minM: 3, maxM: 4 },
  안정형: { minRatio: 0.20, maxRatio: 0.40, minM: 2, maxM: 3 },
  평범형: { minRatio: 0.08, maxRatio: 0.25, minM: 1, maxM: 3 },
};

const DAILY_REWARD = 100; // 봇 출석 보상
const MIN_BET = 100;

function rand(min: number, max: number) { return Math.random() * (max - min) + min; }
function todayKST(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return kst.toISOString().slice(0, 10);
}
function daysSince(dateStr: string | null): number {
  if (!dateStr) return 999;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
}

// ── cron 인증 ────────────────────────────────────────────────────────────────
function requireCronAuth(req: Request): NextResponse | null {
  if (process.env.NODE_ENV === "development") return null;
  const expected = process.env.CRON_SECRET?.trim();
  const provided  = req.headers.get("authorization")?.trim();
  if (!expected) return NextResponse.json({ ok: false, error: "Missing CRON_SECRET" }, { status: 500 });
  if (!provided || provided !== expected) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  return null;
}

// ── 메인 로직 ─────────────────────────────────────────────────────────────────
async function runBotActivity() {
  const svc = createServiceRoleClient();
  const today = todayKST();
  const results: Record<string, unknown>[] = [];

  // 1. 활성 보트 조회
  const { data: openBets } = await svc
    .from("bets")
    .select("id, title, options, closing_at")
    .in("status", ["active", "open"])
    .order("created_at", { ascending: false })
    .limit(30);

  const activeBets = (openBets ?? []).filter(
    (b) => !b.closing_at || new Date(b.closing_at).getTime() > Date.now()
  );

  if (activeBets.length === 0) {
    console.log(LOG, "활성 보트 없음 — 종료");
    return NextResponse.json({ ok: true, message: "no active bets", bets: 0 });
  }

  console.log(LOG, `활성 보트 ${activeBets.length}개`);

  // 2. 프로필 일괄 조회
  const botIds = BOTS.map((b) => b.id);
  const { data: profiles } = await svc
    .from("profiles")
    .select("id, pebbles, last_reward_date")
    .in("id", botIds);

  const profileMap = new Map(
    (profiles ?? []).map((p: { id: string; pebbles: number; last_reward_date: string | null }) => [p.id, p])
  );

  // 3. 봇 유저 메타데이터 조회 (last_activity_date)
  const metaMap = new Map<string, string | null>();
  for (const bot of BOTS) {
    try {
      const { data } = await (svc.auth as any).admin.getUserById(bot.id);
      const meta = data?.user?.user_metadata ?? {};
      metaMap.set(bot.id, meta.last_activity_date ?? null);
    } catch { metaMap.set(bot.id, null); }
  }

  let totalBets = 0;
  let activeCount = 0;

  // 4. 봇별 처리
  for (const bot of BOTS) {
    const profile = profileMap.get(bot.id);
    const lastActivity = metaMap.get(bot.id) ?? null;
    const sinceLastActivity = daysSince(lastActivity);

    // 오늘 이미 활동했으면 건너뜀
    if (lastActivity === today) {
      results.push({ nickname: bot.nickname, skipped: true, reason: "already_active_today" });
      continue;
    }

    // 출석 주기 미충족이면 건너뜀
    if (sinceLastActivity < bot.checkinDays) {
      results.push({ nickname: bot.nickname, skipped: true, reason: `waiting(${sinceLastActivity}/${bot.checkinDays}d)` });
      continue;
    }

    activeCount++;
    let balance = Math.max(0, Number(profile?.pebbles ?? 0));

    // 출석 보상 지급
    const newBalance = balance + DAILY_REWARD;
    await svc.from("profiles").update({ pebbles: newBalance, last_reward_date: today }).eq("id", bot.id);
    balance = newBalance;

    console.log(LOG, `${bot.nickname} [${bot.style}] 활성 — 잔고 ${balance}P`);

    // 베팅 처리
    const s = STRATEGY[bot.style];
    if (balance < MIN_BET) {
      results.push({ nickname: bot.nickname, skipped: true, reason: "insufficient_balance" });
      continue;
    }

    const marketCount = Math.round(rand(s.minM, s.maxM + 0.5));
    const shuffled = [...activeBets].sort(() => Math.random() - 0.5).slice(0, marketCount);
    let botBets = 0;

    for (const bet of shuffled) {
      let options: unknown[] = [];
      try {
        const raw = typeof bet.options === "string" ? JSON.parse(bet.options) : bet.options;
        options = Array.isArray(raw) ? raw : [];
      } catch { continue; }
      if (options.length === 0) continue;

      const perBetRatio = rand(s.minRatio, s.maxRatio) / shuffled.length;
      const amount = Math.max(MIN_BET, Math.floor((balance * perBetRatio) / 100) * 100);

      const optIdx = Math.floor(Math.random() * options.length);
      const optionId = `${bet.id}-opt-${optIdx}`;

      const { error } = await svc.rpc("place_bets_secure", {
        p_user_id: bot.id,
        p_boat_id: bet.id,
        p_bets: [{ option_id: optionId, amount }],
      });

      if (!error) {
        botBets++;
        totalBets++;
        console.log(LOG, `  🎯 ${bot.nickname} → "${(bet.title ?? "").slice(0, 20)}" opt-${optIdx} ${amount}P`);
      } else {
        console.warn(LOG, `  ⚠️  ${bot.nickname} 베팅 실패: ${error.message}`);
      }

      await new Promise((r) => setTimeout(r, 80));
    }

    // last_activity_date 업데이트
    await (svc.auth as any).admin.updateUserById(bot.id, {
      user_metadata: { last_activity_date: today },
    });

    results.push({ nickname: bot.nickname, style: bot.style, bets: botBets, reward: DAILY_REWARD });
  }

  console.log(LOG, `완료 — 활성 봇 ${activeCount}명, 베팅 ${totalBets}건`);

  return NextResponse.json({
    ok: true,
    date: today,
    activeBots: activeCount,
    totalBets,
    results,
  });
}

export async function GET(request: Request) {
  const authErr = requireCronAuth(request);
  if (authErr) return authErr;

  try {
    return await runBotActivity();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(LOG, "fatal", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authErr = requireCronAuth(request);
  if (authErr) return authErr;

  try {
    return await runBotActivity();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(LOG, "fatal", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
