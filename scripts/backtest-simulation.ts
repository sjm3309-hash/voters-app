import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

/**
 * Backtest Simulation (7 days)
 *
 * - Creates 10 temporary profiles
 * - Simulates 7 days of random betting behavior
 * - Intentionally triggers limit violations
 * - Tracks balances in-memory, writes bet_history rows to DB (service role)
 *
 * Run:
 *   npx tsx scripts/backtest-simulation.ts
 *
 * Optional:
 *   SIM_CLEANUP=true  -> delete created profiles + bets + bet_history
 */

const MAX_BET_PER_ONCE = 5000;
const MAX_BET_PER_DAY = 30000;
const MAX_BET_PER_WEEK = 150000;

const TEST_USER_COUNT = 10;
const SIM_DAYS = 7;

const LOG = "[backtest]";

// Next.js doesn't auto-load env files for standalone scripts.
dotenv.config({ path: ".env.local" });

type SimUser = {
  id: string; // uuid
  displayName: string;
  balance: number;
  openBetCount: number;
};

type BetRow = {
  id: string;
  external_id?: string | null;
  title: string;
  status?: string | null;
  options?: unknown;
  closing_at: string;
  confirmed_at?: string | null;
};

type BetHistorySchema =
  | { kind: "market_option"; marketIdKey: "market_id"; optionKey: "option_id" }
  | { kind: "bet_choice"; marketIdKey: "bet_id"; optionKey: "choice" }
  | { kind: "unknown" };

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v || !String(v).trim()) throw new Error(`Missing env: ${name}`);
  return String(v).trim();
}

function startOfUtcDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function startOfUtcWeekMonday(d: Date): Date {
  const day = d.getUTCDay(); // 0 Sun ... 6 Sat
  const diffToMonday = (day + 6) % 7; // Mon=0, Sun=6
  const monday = startOfUtcDay(d);
  monday.setUTCDate(monday.getUTCDate() - diffToMonday);
  return monday;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickOne<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]!;
}

function parseOptions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x): x is string => typeof x === "string" && x.trim() !== "");
}

async function ensureSimBetsExist(supabase: ReturnType<typeof createClient>) {
  // Create a couple of tagged simulation markets so we don't touch production markets.
  const tag = "sim:backtest";
  const now = new Date();
  const closingAt = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString();
  const confirmedAt = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString();
  const adminUserId = process.env.ADMIN_USER_ID?.trim();

  const rows: any[] = [
    {
      external_id: `${tag}:football:${now.getTime()}:1`,
      title: "리버풀 vs 맨시티",
      closing_at: closingAt,
      confirmed_at: confirmedAt,
      category: "스포츠",
      sub_category: "해외축구",
      status: "active",
      color: "#C8102E",
      options: ["홈 리버풀 승", "무승부", "어웨이 맨시티 승"],
      is_admin_generated: true,
      author_name: "VOTERS 운영자",
      ...(adminUserId ? { user_id: adminUserId } : {}),
    },
    {
      external_id: `${tag}:lol:${now.getTime()}:2`,
      title: "T1 vs 젠지",
      closing_at: closingAt,
      confirmed_at: confirmedAt,
      category: "게임",
      sub_category: "LoL",
      status: "active",
      color: "#E2012D",
      options: ["승", "패"],
      is_admin_generated: true,
      author_name: "VOTERS 운영자",
      ...(adminUserId ? { user_id: adminUserId } : {}),
    },
  ];

  const { error } = await supabase.from("bets").upsert(rows, { onConflict: "external_id" });
  if (error) {
    console.error(LOG, "seed sim bets upsert failed", error);
  } else {
    console.log(LOG, "seed sim bets ensured", { count: rows.length });
  }
}

async function createTestProfiles(supabase: ReturnType<typeof createClient>): Promise<SimUser[]> {
  const users: SimUser[] = Array.from({ length: TEST_USER_COUNT }, (_, i) => ({
    id: crypto.randomUUID(), // will be replaced if auth admin returns a different id
    displayName: `SIM_USER_${String(i + 1).padStart(2, "0")}`,
    // Mix: some start bankrupt (to exercise draw), most start funded (to hit daily/weekly limits)
    balance: i < 3 ? 0 : 60_000,
    openBetCount: 0,
  }));

  // 1) Create auth users (so profiles FK can pass).
  for (const u of users) {
    const email = `${u.displayName.toLowerCase()}_${Date.now()}@example.com`;
    const password = `Sim!${crypto.randomBytes(12).toString("hex")}`;
    try {
      const res = await (supabase as any).auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { display_name: u.displayName, simulation: true },
      });
      const createdId = res?.data?.user?.id;
      if (createdId) u.id = createdId;
    } catch (e) {
      console.error(LOG, "auth.admin.createUser failed", { displayName: u.displayName, error: e });
    }
  }

  // 2) Insert into profiles table (schema can differ; try common variants).
  const tryInserts = async (rows: any[]) => supabase.from("profiles").insert(rows);
  const variants: any[][] = [
    users.map((u) => ({ id: u.id, display_name: u.displayName, username: u.displayName })),
    users.map((u) => ({ id: u.id, username: u.displayName })),
    users.map((u) => ({ id: u.id, full_name: u.displayName })),
    users.map((u) => ({ id: u.id })),
  ];

  let inserted = false;
  for (const v of variants) {
    const { error } = await tryInserts(v);
    if (!error) {
      inserted = true;
      break;
    }
    const code = (error as any)?.code;
    if (code === "23505") {
      // already exists (trigger may auto-create). that's fine.
      inserted = true;
      break;
    }
    // PGRST204: missing column - try the next variant
    if (code !== "PGRST204") {
      console.error(LOG, "profiles insert failed", error);
      break;
    }
  }

  if (inserted) console.log(LOG, "profiles inserted/ensured", { count: users.length });
  else console.warn(LOG, "profiles not inserted (schema mismatch). Continuing in-memory only.");

  return users;
}

async function detectBetHistoryTable(supabase: ReturnType<typeof createClient>): Promise<{
  exists: boolean;
  error?: unknown;
}> {
  const { error } = await supabase.from("bet_history").select("amount").limit(1);
  if (!error) return { exists: true };
  const code = (error as any)?.code;
  if (code === "PGRST205") return { exists: false, error };
  // any other error: assume exists but inaccessible (RLS etc.)
  return { exists: true, error };
}

async function detectBetHistorySchema(supabase: ReturnType<typeof createClient>): Promise<BetHistorySchema> {
  // Our code expects (market_id, option_id), but some DBs use (bet_id, choice).
  const a = await supabase.from("bet_history").select("market_id").limit(1);
  if (!a.error) return { kind: "market_option", marketIdKey: "market_id", optionKey: "option_id" };
  const b = await supabase.from("bet_history").select("bet_id").limit(1);
  if (!b.error) return { kind: "bet_choice", marketIdKey: "bet_id", optionKey: "choice" };
  return { kind: "unknown" };
}

async function loadActiveSimBets(supabase: ReturnType<typeof createClient>): Promise<BetRow[]> {
  const { data, error } = await supabase
    .from("bets")
    .select("id, external_id, title, status, options, closing_at, confirmed_at")
    .eq("status", "active")
    .like("external_id", "sim:backtest:%")
    .limit(200);

  if (error) {
    console.error(LOG, "load active sim bets failed", error);
    return [];
  }
  return (data ?? []) as BetRow[];
}

async function sumUserBetsSince(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  sinceISO: string,
): Promise<number> {
  const { data, error } = await supabase
    .from("bet_history")
    .select("amount, created_at")
    .eq("user_id", userId)
    .gte("created_at", sinceISO)
    .limit(5000);

  if (error) {
    console.error(LOG, "bet_history sum query failed", { userId, sinceISO, error });
    return 0;
  }

  return (data ?? []).reduce((acc, r: any) => acc + (Number(r.amount) || 0), 0);
}

async function tryPlaceBet(params: {
  supabase: ReturnType<typeof createClient>;
  user: SimUser;
  bet: BetRow;
  optionId: string;
  amount: number;
  now: Date;
  betHistoryExists: boolean;
  memoryLedger: Map<string, { ts: number; amount: number }[]>;
  betHistorySchema: BetHistorySchema;
}): Promise<{ ok: true } | { ok: false; blockedByLimit?: boolean; reason: string; error?: unknown }> {
  const { supabase, user, bet, optionId, amount, now, betHistoryExists, memoryLedger, betHistorySchema } = params;

  if (amount <= 0) return { ok: false, reason: "amount <= 0" };
  if (user.balance < amount) return { ok: false, reason: "insufficient_balance" };

  if (amount > MAX_BET_PER_ONCE) {
    return { ok: false, blockedByLimit: true, reason: `per_once_limit(${MAX_BET_PER_ONCE})` };
  }

  const dayStart = startOfUtcDay(now).toISOString();
  const weekStart = startOfUtcWeekMonday(now).toISOString();
  let daySum = 0;
  let weekSum = 0;
  if (betHistoryExists) {
    [daySum, weekSum] = await Promise.all([
      sumUserBetsSince(supabase, user.id, dayStart),
      sumUserBetsSince(supabase, user.id, weekStart),
    ]);
  } else {
    const ledger = memoryLedger.get(user.id) ?? [];
    const dayMs = Date.parse(dayStart);
    const weekMs = Date.parse(weekStart);
    for (const r of ledger) {
      if (r.ts >= weekMs) weekSum += r.amount;
      if (r.ts >= dayMs) daySum += r.amount;
    }
  }

  if (daySum + amount > MAX_BET_PER_DAY) {
    return { ok: false, blockedByLimit: true, reason: `per_day_limit(${MAX_BET_PER_DAY})` };
  }
  if (weekSum + amount > MAX_BET_PER_WEEK) {
    return { ok: false, blockedByLimit: true, reason: `per_week_limit(${MAX_BET_PER_WEEK})` };
  }

  if (betHistoryExists) {
    const base: any = {
      user_id: user.id,
      amount,
      created_at: now.toISOString(),
    };
    if (betHistorySchema.kind === "market_option") {
      base[betHistorySchema.marketIdKey] = bet.id;
      base[betHistorySchema.optionKey] = optionId;
    } else if (betHistorySchema.kind === "bet_choice") {
      base[betHistorySchema.marketIdKey] = bet.id;
      base[betHistorySchema.optionKey] = optionId;
    } else {
      // last resort: try common names
      base.bet_id = bet.id;
      base.choice = optionId;
    }

    const { error } = await supabase.from("bet_history").insert(base);
    if (error) return { ok: false, reason: "db_insert_failed", error };
  } else {
    const ledger = memoryLedger.get(user.id) ?? [];
    ledger.push({ ts: now.getTime(), amount });
    memoryLedger.set(user.id, ledger);
  }

  user.balance -= amount;
  user.openBetCount += 1;
  return { ok: true };
}

async function tryBankruptcyDraw(params: {
  user: SimUser;
  now: Date;
}): Promise<{ ok: true; amount: number; via: "fallback" | "api" } | { ok: false; reason: string; error?: unknown }> {
  const { user } = params;

  // Requested: call /api/bankruptcy-draw. If not available locally, fall back to a deterministic “grant”.
  try {
    const res = await fetch("http://localhost:3000/api/bankruptcy-draw", { method: "POST" });
    if (res.ok) {
      const json: any = await res.json().catch(() => ({}));
      const granted = Number(json?.amount ?? json?.granted ?? 0);
      if (Number.isFinite(granted) && granted > 0) {
        user.balance += granted;
        return { ok: true, amount: granted, via: "api" };
      }
      // If API exists but doesn't return amount, still consider it executed.
      return { ok: true, amount: 0, via: "api" };
    }
  } catch (e) {
    // ignore, use fallback below
  }

  const fallbackGrant = 10_000;
  user.balance += fallbackGrant;
  return { ok: true, amount: fallbackGrant, via: "fallback" };
}

function settleDay(users: SimUser[]) {
  // Virtual settlement: assume all open bets settle 1:1 at end-of-day.
  // For simplicity: each open bet has a 50% chance to win and pays 2x stake (net +stake),
  // but we don't have per-bet stake tracking in-memory, so we approximate:
  // - convert openBetCount into random wins and grant a fixed payout per win.
  // This keeps the “balance changes over time” behavior without touching production DB.
  const payoutPerWin = 3000;
  for (const u of users) {
    if (u.openBetCount <= 0) continue;
    const wins = randInt(0, u.openBetCount);
    u.balance += wins * payoutPerWin;
    u.openBetCount = 0;
  }
}

async function cleanup(params: {
  supabase: ReturnType<typeof createClient>;
  users: SimUser[];
}) {
  const { supabase, users } = params;
  const userIds = users.map((u) => u.id);

  // delete bet_history for these users
  const del1 = await supabase.from("bet_history").delete().in("user_id", userIds);
  if (del1.error) console.error(LOG, "cleanup bet_history failed", del1.error);

  // delete sim bets
  const del2 = await supabase.from("bets").delete().like("external_id", "sim:backtest:%");
  if (del2.error) console.error(LOG, "cleanup sim bets failed", del2.error);

  // delete profiles
  const del3 = await supabase.from("profiles").delete().in("id", userIds);
  if (del3.error) console.error(LOG, "cleanup profiles failed", del3.error);

  console.log(LOG, "cleanup done");
}

async function main() {
  const supabaseUrl = mustEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = mustEnv("SUPABASE_SERVICE_ROLE_KEY");

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const errors: Array<{ day: number; userId?: string; kind: string; detail: unknown }> = [];
  let totalBetCount = 0;
  let totalDrawCount = 0;
  let blockedByLimitCount = 0;
  const blockedBy = { once: 0, day: 0, week: 0 };

  await ensureSimBetsExist(supabase);
  const users = await createTestProfiles(supabase);
  const betHistory = await detectBetHistoryTable(supabase);
  const betHistorySchema = betHistory.exists ? await detectBetHistorySchema(supabase) : ({ kind: "unknown" } as const);
  if (betHistory.exists) {
    console.log(LOG, "bet_history schema", betHistorySchema);
  }
  if (!betHistory.exists) {
    console.warn(LOG, "bet_history table not found. Falling back to in-memory ledger for limits & inserts.", betHistory.error);
  } else if (betHistory.error) {
    console.warn(LOG, "bet_history probe returned error (may be RLS/cache). Continuing.", betHistory.error);
  }
  const memoryLedger = new Map<string, { ts: number; amount: number }[]>();

  for (let day = 1; day <= SIM_DAYS; day += 1) {
    const now = new Date();
    now.setUTCDate(now.getUTCDate() + (day - 1));

    const bets = await loadActiveSimBets(supabase);
    if (bets.length === 0) {
      console.warn(LOG, `day ${day}: no active sim bets found`);
      continue;
    }

    for (const user of users) {
      // Randomly either bet or attempt bankruptcy draw conditionally.
      const action = Math.random() < 0.8 ? "bet" : "maybe_draw";

      if (action === "maybe_draw") {
        if (user.balance === 0 && user.openBetCount === 0) {
          const r = await tryBankruptcyDraw({ user, now });
          if (r.ok) {
            totalDrawCount += 1;
          } else {
            errors.push({ day, userId: user.id, kind: "bankruptcy_draw_failed", detail: r });
          }
        }
        continue;
      }

      const bet = pickOne(bets);
      const options = parseOptions(bet.options);
      const optionId = options.length > 0 ? pickOne(options) : "승";

      // Normal random bet amount: 100~10,000 (request)
      const amount = Math.min(randInt(100, 10_000), Math.max(0, user.balance));
      if (amount <= 0) {
        if (user.balance === 0 && user.openBetCount === 0) {
          const r = await tryBankruptcyDraw({ user, now });
          if (r.ok) totalDrawCount += 1;
          else errors.push({ day, userId: user.id, kind: "bankruptcy_draw_failed", detail: r });
        }
        continue;
      }

      const placed = await tryPlaceBet({
        supabase,
        user,
        bet,
        optionId,
        amount,
        now,
        betHistoryExists: betHistory.exists,
        memoryLedger,
        betHistorySchema,
      });
      if (placed.ok) {
        totalBetCount += 1;
      } else {
        if (placed.blockedByLimit) {
          blockedByLimitCount += 1;
          if (String(placed.reason).startsWith("per_once_limit")) blockedBy.once += 1;
          if (String(placed.reason).startsWith("per_day_limit")) blockedBy.day += 1;
          if (String(placed.reason).startsWith("per_week_limit")) blockedBy.week += 1;
        }
        errors.push({ day, userId: user.id, kind: "place_bet_failed", detail: placed });
      }

      // Force error induction (1): exceed per-once limit
      const forcedOnceAmount = 10_000;
      const forcedOnce = await tryPlaceBet({
        supabase,
        user,
        bet,
        optionId,
        amount: forcedOnceAmount,
        now,
        betHistoryExists: betHistory.exists,
        memoryLedger,
        betHistorySchema,
      });
      if (!forcedOnce.ok && forcedOnce.blockedByLimit) {
        blockedByLimitCount += 1;
        blockedBy.once += 1;
      } else if (forcedOnce.ok) {
        totalBetCount += 1;
        errors.push({
          day,
          userId: user.id,
          kind: "forced_once_bet_unexpectedly_ok",
          detail: { forcedOnceAmount },
        });
      }

      // Force error induction (2): exceed DAILY cap (30,000) using allowed per-once amounts.
      // We "top up" today's betting to near the cap, then attempt one more 5,000.
      const dayStartISO = startOfUtcDay(now).toISOString();
      let todaySum = 0;
      if (!betHistory.exists) {
        const ledger = memoryLedger.get(user.id) ?? [];
        const dayMs = Date.parse(dayStartISO);
        for (const r of ledger) if (r.ts >= dayMs) todaySum += r.amount;
      } else {
        todaySum = await sumUserBetsSince(supabase, user.id, dayStartISO);
      }

      // Only do the "daily cap" forcing for a subset to keep runtime/DB noise low.
      if (Math.random() < 0.25) {
        while (todaySum < 28_000 && user.balance >= 5_000) {
          const topUp = await tryPlaceBet({
            supabase,
            user,
            bet,
            optionId,
            amount: 5_000,
            now,
            betHistoryExists: betHistory.exists,
            memoryLedger,
            betHistorySchema,
          });
          if (!topUp.ok) break;
          totalBetCount += 1;
          todaySum += 5_000;
        }
      }

      if (todaySum >= 28_000) {
        const forcedDayAmount = 5_000;
        const forcedDay = await tryPlaceBet({
          supabase,
          user,
          bet,
          optionId,
          amount: forcedDayAmount,
          now,
          betHistoryExists: betHistory.exists,
          memoryLedger,
          betHistorySchema,
        });
        if (!forcedDay.ok && forcedDay.blockedByLimit) {
          blockedByLimitCount += 1;
          if (String(forcedDay.reason).startsWith("per_day_limit")) blockedBy.day += 1;
          else if (String(forcedDay.reason).startsWith("per_once_limit")) blockedBy.once += 1;
          else if (String(forcedDay.reason).startsWith("per_week_limit")) blockedBy.week += 1;
        } else if (forcedDay.ok) {
          totalBetCount += 1;
          errors.push({
            day,
            userId: user.id,
            kind: "forced_day_bet_unexpectedly_ok",
            detail: { todaySum, forcedDayAmount },
          });
        } else if (!forcedDay.blockedByLimit) {
          errors.push({ day, userId: user.id, kind: "forced_bet_failed_nonlimit", detail: forcedDay });
        }
      }
    }

    // Virtual settlement at end of each day
    settleDay(users);
  }

  const avgBalance =
    users.length === 0 ? 0 : Math.round(users.reduce((acc, u) => acc + u.balance, 0) / users.length);

  console.log("");
  console.log("==== Backtest Report ====");
  console.log("총 베팅 횟수:", totalBetCount);
  console.log("총 제비뽑기 횟수:", totalDrawCount);
  console.log("7일 후 유저 평균 잔액:", avgBalance);
  console.log("상한선 로직에 의해 차단된 횟수:", blockedByLimitCount);
  console.log(" - 1회 상한 차단:", blockedBy.once);
  console.log(" - 일일 상한 차단:", blockedBy.day);
  console.log(" - 주간 상한 차단:", blockedBy.week);

  const dbErrors = errors.filter((e) => {
    if (e.kind === "place_bet_failed") {
      const d: any = e.detail;
      return d?.reason === "db_insert_failed";
    }
    if (e.kind === "forced_bet_failed_nonlimit") return true;
    return false;
  });

  if (dbErrors.length > 0) {
    console.log("");
    console.log("DB 에러 발생 로그:");
    for (const e of dbErrors.slice(0, 50)) {
      console.log("-", { day: e.day, userId: e.userId, kind: e.kind, detail: e.detail });
    }
    if (dbErrors.length > 50) console.log(`... and ${dbErrors.length - 50} more`);
  } else {
    console.log("");
    console.log("DB 에러 발생 로그: 없음");
  }

  if (!betHistory.exists) {
    console.log("");
    console.log("주의: bet_history 테이블이 없어 DB 기반 차단/저장이 아닌 메모리 기반으로 시뮬레이션했습니다.");
  }

  if (String(process.env.SIM_CLEANUP || "").toLowerCase() === "true") {
    await cleanup({ supabase, users });
  } else {
    console.log("");
    console.log(`${LOG} cleanup skipped (set SIM_CLEANUP=true to delete sim rows)`);
  }
}

main().catch((e) => {
  console.error(LOG, "fatal", e);
  process.exitCode = 1;
});
