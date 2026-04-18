import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

/**
 * Backtest Simulation (7 days)
 *
 * - 시뮬 유저가 운영 보트(sim:backtest*) 및 유저 생성 보트(sim:backtest:userboat*)에 베팅
 * - option_id는 반드시 `${bets.id}-opt-${i}` 형태 (앱·DB와 동일). 과거 버전은 라벨 문자열을 넣어 INSERT 실패/불일치 발생.
 * - 베팅 전후 profiles.pebbles는 adjust_pebbles_atomic 으로 차감·환불 (실제 place-bet API와 동일한 순서)
 *
 * Run:
 *   npx tsx scripts/backtest-simulation.ts
 *
 * Env:
 *   SIM_USER_IDS=id1,id2,...  기존 유저 목록의 시뮬 계정만 사용 (프로필 pebbles 기준 시작 잔액). 미설정 시 임시 계정 10명 생성.
 *   SIM_CLEANUP=true          시뮬 행 정리 (SIM_USER_IDS 사용 시 프로필 삭제는 기본 끔 — 아래 참고)
 *   SIM_CLEANUP_PROFILES=true SIM_USER_IDS 없을 때만 의미 있음 / 있어도 프로필 삭제 시 이 플래그 필요
 */

/** 동일 보트(마켓)당 유저 누적 스테이크 상한 (앱 place-bet 과 동일) */
const MAX_STAKE_PER_MARKET = 5000;
const MAX_BET_PER_DAY = 30000;
const MAX_BET_PER_WEEK = 150000;

type MemoryLedgerRow = { ts: number; amount: number; marketId: string };

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

/** 앱 lib/bets-market-mapper 의 옵션 id 규칙과 동일 */
function randomOptionIdForBet(bet: BetRow): string {
  const labels = parseOptions(bet.options);
  const n = Math.max(labels.length, 2);
  const idx = randInt(0, n - 1);
  return `${bet.id}-opt-${idx}`;
}

/** 서비스 롤 — place-bet API 와 동일한 페블 차감 (RPC + 폴백) */
async function adjustPebblesScript(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  delta: number,
): Promise<{ ok: true; balance: number } | { ok: false; error: string }> {
  const d = Math.trunc(Number(delta));
  if (!userId) return { ok: false, error: "invalid_user" };

  const { data, error } = await supabase.rpc("adjust_pebbles_atomic", {
    p_user_id: userId,
    p_delta: d,
  });

  if (!error) {
    return { ok: true, balance: Math.max(0, Math.floor(Number(data ?? 0))) };
  }

  const msg = error.message ?? String(error);
  if (msg.includes("insufficient_pebbles")) return { ok: false, error: "insufficient_pebbles" };

  const { data: row, error: selErr } = await supabase.from("profiles").select("pebbles").eq("id", userId).maybeSingle();
  if (selErr) return { ok: false, error: selErr.message };

  const cur = Math.max(0, Math.floor(Number((row as { pebbles?: unknown } | null)?.pebbles ?? 0)));

  if (!row) {
    const next = Math.max(0, cur + d);
    if (next < 0 && d < 0) return { ok: false, error: "insufficient_pebbles" };
    const { error: insErr } = await supabase.from("profiles").insert({ id: userId, pebbles: next });
    if (insErr) return { ok: false, error: insErr.message };
    return { ok: true, balance: next };
  }

  const next = cur + d;
  if (next < 0) return { ok: false, error: "insufficient_pebbles" };
  const { error: upErr } = await supabase.from("profiles").update({ pebbles: next }).eq("id", userId);
  if (upErr) return { ok: false, error: upErr.message };
  return { ok: true, balance: next };
}

async function loadSimUsersFromEnv(supabase: ReturnType<typeof createClient>): Promise<SimUser[] | null> {
  const raw = process.env.SIM_USER_IDS?.trim();
  if (!raw) return null;

  const ids = raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (ids.length === 0) return null;

  const { data: rows, error } = await supabase.from("profiles").select("id, pebbles").in("id", ids);
  if (error) {
    console.error(LOG, "SIM_USER_IDS profile load failed", error);
    return null;
  }

  const byId = new Map((rows ?? []).map((r: { id: string; pebbles?: unknown }) => [r.id, Math.max(0, Math.floor(Number(r.pebbles ?? 0)))]));

  const users: SimUser[] = ids.map((id, i) => ({
    id,
    displayName: `SIM_LOADED_${String(i + 1).padStart(2, "0")}`,
    balance: byId.get(id) ?? 0,
    openBetCount: 0,
  }));

  console.log(LOG, "using SIM_USER_IDS", { count: users.length });
  return users;
}

async function pushSimUserBalanceToDb(supabase: ReturnType<typeof createClient>, u: SimUser) {
  const { error } = await supabase.from("profiles").upsert(
    { id: u.id, pebbles: Math.max(0, Math.floor(u.balance)) },
    { onConflict: "id" },
  );
  if (error) {
    await supabase.from("profiles").update({ pebbles: Math.max(0, Math.floor(u.balance)) }).eq("id", u.id);
  }
}

/** 시뮬 유저가 만든 소규모 보트 (sim:backtest:userboat:% ) */
async function seedUserCreatedSimMarkets(supabase: ReturnType<typeof createClient>, users: SimUser[]) {
  const ts = Date.now();
  const slice = users.slice(0, Math.min(6, users.length));
  const rows = slice.map((u, i) => ({
    external_id: `sim:backtest:userboat:${u.id}:${ts}:${i}`,
    title: `[SIM 유저보트] ${u.displayName} D0`,
    closing_at: new Date(ts + 72 * 60 * 60 * 1000).toISOString(),
    confirmed_at: null as string | null,
    category: "재미",
    sub_category: "기타",
    status: "active" as const,
    color: "#6366f1",
    options: ["예", "아니오"],
    is_admin_generated: false,
    author_name: u.displayName.slice(0, 120),
    user_id: u.id,
  }));

  const { error } = await supabase.from("bets").upsert(rows, { onConflict: "external_id" });
  if (error) console.error(LOG, "seedUserCreatedSimMarkets failed", error);
  else console.log(LOG, "user-created sim markets upserted", { count: rows.length });
}

async function sumPoolOnMarket(
  supabase: ReturnType<typeof createClient>,
  marketId: string,
): Promise<number> {
  const q1 = await supabase.from("bet_history").select("amount").eq("market_id", marketId);
  if (!q1.error) {
    return (q1.data ?? []).reduce(
      (acc, r: { amount?: unknown }) => acc + Math.max(0, Math.floor(Number(r.amount ?? 0))),
      0,
    );
  }
  const q2 = await supabase.from("bet_history").select("amount").eq("bet_id", marketId);
  if (!q2.error) {
    return (q2.data ?? []).reduce(
      (acc, r: { amount?: unknown }) => acc + Math.max(0, Math.floor(Number(r.amount ?? 0))),
      0,
    );
  }
  return -1;
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

async function sumUserBetsOnMarketDb(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  marketId: string,
  schema: BetHistorySchema,
): Promise<number> {
  if (schema.kind === "unknown") return 0;
  const col = schema.marketIdKey;
  const { data, error } = await supabase
    .from("bet_history")
    .select("amount")
    .eq("user_id", userId)
    .eq(col, marketId)
    .limit(5000);

  if (error) {
    console.error(LOG, "sumUserBetsOnMarketDb failed", { userId, marketId, error });
    return 0;
  }

  return (data ?? []).reduce((acc, r: { amount?: unknown }) => acc + (Number(r.amount) || 0), 0);
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
  amount: number;
  now: Date;
  betHistoryExists: boolean;
  memoryLedger: Map<string, MemoryLedgerRow[]>;
  betHistorySchema: BetHistorySchema;
  /** 같은 라운드에서 동일 선택지로 한도 테스트할 때 */
  fixedOptionId?: string;
}): Promise<{ ok: true } | { ok: false; blockedByLimit?: boolean; reason: string; error?: unknown }> {
  const { supabase, user, bet, amount, now, betHistoryExists, memoryLedger, betHistorySchema, fixedOptionId } =
    params;

  if (amount <= 0) return { ok: false, reason: "amount <= 0" };
  if (user.balance < amount) return { ok: false, reason: "insufficient_balance" };

  let existingOnMarket = 0;
  if (betHistoryExists) {
    existingOnMarket = await sumUserBetsOnMarketDb(supabase, user.id, bet.id, betHistorySchema);
  } else {
    const ledger = memoryLedger.get(user.id) ?? [];
    for (const r of ledger) {
      if (r.marketId === bet.id) existingOnMarket += r.amount;
    }
  }
  if (existingOnMarket + amount > MAX_STAKE_PER_MARKET) {
    return {
      ok: false,
      blockedByLimit: true,
      reason: `per_market_limit(${MAX_STAKE_PER_MARKET};existing=${existingOnMarket})`,
    };
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

  const optionId = fixedOptionId ?? randomOptionIdForBet(bet);

  const spent = await adjustPebblesScript(supabase, user.id, -amount);
  if (!spent.ok) {
    if (spent.error === "insufficient_pebbles") return { ok: false, reason: "insufficient_pebbles" };
    return { ok: false, reason: "deduct_failed", error: spent.error };
  }
  user.balance = spent.balance;

  if (betHistoryExists) {
    const base: Record<string, unknown> = {
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
      base.bet_id = bet.id;
      base.choice = optionId;
    }

    const { error } = await supabase.from("bet_history").insert(base);
    if (error) {
      const refunded = await adjustPebblesScript(supabase, user.id, amount);
      if (refunded.ok) user.balance = refunded.balance;
      return { ok: false, reason: "db_insert_failed", error };
    }
  } else {
    const ledger = memoryLedger.get(user.id) ?? [];
    ledger.push({ ts: now.getTime(), amount, marketId: bet.id });
    memoryLedger.set(user.id, ledger);
  }

  user.openBetCount += 1;
  return { ok: true };
}

async function tryBankruptcyDraw(params: {
  supabase: ReturnType<typeof createClient>;
  user: SimUser;
  now: Date;
}): Promise<{ ok: true; amount: number; via: "fallback" | "api" } | { ok: false; reason: string; error?: unknown }> {
  const { supabase, user } = params;

  try {
    const res = await fetch("http://localhost:3000/api/bankruptcy-draw", { method: "POST" });
    if (res.ok) {
      const json: any = await res.json().catch(() => ({}));
      const granted = Number(json?.amount ?? json?.granted ?? 0);
      if (Number.isFinite(granted) && granted > 0) {
        const added = await adjustPebblesScript(supabase, user.id, granted);
        if (added.ok) user.balance = added.balance;
        else user.balance += granted;
        return { ok: true, amount: granted, via: "api" };
      }
      return { ok: true, amount: 0, via: "api" };
    }
  } catch {
    /* fallback below */
  }

  const fallbackGrant = 10_000;
  const added = await adjustPebblesScript(supabase, user.id, fallbackGrant);
  if (added.ok) user.balance = added.balance;
  else user.balance += fallbackGrant;
  return { ok: true, amount: fallbackGrant, via: "fallback" };
}

async function settleDay(supabase: ReturnType<typeof createClient>, users: SimUser[]) {
  const payoutPerWin = 3000;
  for (const u of users) {
    if (u.openBetCount <= 0) continue;
    const wins = randInt(0, u.openBetCount);
    const grant = wins * payoutPerWin;
    if (grant > 0) {
      const added = await adjustPebblesScript(supabase, u.id, grant);
      if (added.ok) u.balance = added.balance;
      else u.balance += grant;
    }
    u.openBetCount = 0;
  }
}

async function cleanup(params: {
  supabase: ReturnType<typeof createClient>;
  users: SimUser[];
  deleteProfiles: boolean;
}) {
  const { supabase, users, deleteProfiles } = params;
  const userIds = users.map((u) => u.id);

  const del1 = await supabase.from("bet_history").delete().in("user_id", userIds);
  if (del1.error) console.error(LOG, "cleanup bet_history failed", del1.error);

  const del2 = await supabase.from("bets").delete().like("external_id", "sim:backtest:%");
  if (del2.error) console.error(LOG, "cleanup sim bets failed", del2.error);

  if (deleteProfiles) {
    const del3 = await supabase.from("profiles").delete().in("id", userIds);
    if (del3.error) console.error(LOG, "cleanup profiles failed", del3.error);
  } else {
    console.log(LOG, "cleanup: profiles kept (SIM_USER_IDS or SIM_CLEANUP_PROFILES unset)");
  }

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
  const blockedBy = { market: 0, day: 0, week: 0 };

  await ensureSimBetsExist(supabase);

  const fromEnvList = await loadSimUsersFromEnv(supabase);
  const users = fromEnvList ?? (await createTestProfiles(supabase));

  for (const u of users) {
    await pushSimUserBalanceToDb(supabase, u);
  }

  await seedUserCreatedSimMarkets(supabase, users);

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
  const memoryLedger = new Map<string, MemoryLedgerRow[]>();

  const anchorStart = startOfUtcDay(new Date());
  anchorStart.setUTCDate(anchorStart.getUTCDate() - (SIM_DAYS - 1));

  for (let day = 1; day <= SIM_DAYS; day += 1) {
    const dayBase = new Date(anchorStart.getTime() + (day - 1) * 86400000);
    const now = new Date(dayBase.getTime() + randInt(3600000, 75600000));

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
          const r = await tryBankruptcyDraw({ supabase, user, now });
          if (r.ok) {
            totalDrawCount += 1;
          } else {
            errors.push({ day, userId: user.id, kind: "bankruptcy_draw_failed", detail: r });
          }
        }
        continue;
      }

      const bet = pickOne(bets);
      const optionIdForRound = randomOptionIdForBet(bet);

      // Normal random bet amount: 100~10,000 (request)
      const amount = Math.min(randInt(100, 10_000), Math.max(0, user.balance));
      if (amount <= 0) {
        if (user.balance === 0 && user.openBetCount === 0) {
          const r = await tryBankruptcyDraw({ supabase, user, now });
          if (r.ok) totalDrawCount += 1;
          else errors.push({ day, userId: user.id, kind: "bankruptcy_draw_failed", detail: r });
        }
        continue;
      }

      const placed = await tryPlaceBet({
        supabase,
        user,
        bet,
        amount,
        now,
        betHistoryExists: betHistory.exists,
        memoryLedger,
        betHistorySchema,
        fixedOptionId: optionIdForRound,
      });
      if (placed.ok) {
        totalBetCount += 1;
      } else {
        if (placed.blockedByLimit) {
          blockedByLimitCount += 1;
          if (String(placed.reason).startsWith("per_market_limit")) blockedBy.market += 1;
          if (String(placed.reason).startsWith("per_day_limit")) blockedBy.day += 1;
          if (String(placed.reason).startsWith("per_week_limit")) blockedBy.week += 1;
        }
        errors.push({ day, userId: user.id, kind: "place_bet_failed", detail: placed });
      }

      // Force error induction (1): 보트당 누적 5,000 초과 — 먼저 5,000 성공 후 같은 보트에 5,000 재시도
      const fillMarket = await tryPlaceBet({
        supabase,
        user,
        bet,
        amount: 5_000,
        now,
        betHistoryExists: betHistory.exists,
        memoryLedger,
        betHistorySchema,
        fixedOptionId: optionIdForRound,
      });
      if (fillMarket.ok) totalBetCount += 1;

      const forcedSecondOnSameMarket = await tryPlaceBet({
        supabase,
        user,
        bet,
        amount: 5_000,
        now,
        betHistoryExists: betHistory.exists,
        memoryLedger,
        betHistorySchema,
        fixedOptionId: optionIdForRound,
      });
      if (!forcedSecondOnSameMarket.ok && forcedSecondOnSameMarket.blockedByLimit) {
        blockedByLimitCount += 1;
        blockedBy.market += 1;
      } else if (forcedSecondOnSameMarket.ok) {
        totalBetCount += 1;
        errors.push({
          day,
          userId: user.id,
          kind: "forced_market_second_bet_unexpectedly_ok",
          detail: { note: "same market 5000+5000 should fail" },
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
          const betForTopUp = pickOne(bets);
          const optTop = randomOptionIdForBet(betForTopUp);
          const topUp = await tryPlaceBet({
            supabase,
            user,
            bet: betForTopUp,
            amount: 5_000,
            now,
            betHistoryExists: betHistory.exists,
            memoryLedger,
            betHistorySchema,
            fixedOptionId: optTop,
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
          amount: forcedDayAmount,
          now,
          betHistoryExists: betHistory.exists,
          memoryLedger,
          betHistorySchema,
          fixedOptionId: optionIdForRound,
        });
        if (!forcedDay.ok && forcedDay.blockedByLimit) {
          blockedByLimitCount += 1;
          if (String(forcedDay.reason).startsWith("per_day_limit")) blockedBy.day += 1;
          else if (String(forcedDay.reason).startsWith("per_market_limit")) blockedBy.market += 1;
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

    await settleDay(supabase, users);
  }

  const avgBalance =
    users.length === 0 ? 0 : Math.round(users.reduce((acc, u) => acc + u.balance, 0) / users.length);

  console.log("");
  console.log("==== Backtest Report ====");
  console.log("총 베팅 횟수:", totalBetCount);
  console.log("총 제비뽑기 횟수:", totalDrawCount);
  console.log("7일 후 유저 평균 잔액:", avgBalance);
  console.log("상한선 로직에 의해 차단된 횟수:", blockedByLimitCount);
  console.log(" - 보트(마켓)당 누적 상한 차단:", blockedBy.market);
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

  if (betHistory.exists) {
    const active = await loadActiveSimBets(supabase);
    console.log("");
    console.log("==== 마켓별 bet_history 풀 합계 (market_id 또는 bet_id = bets.id) ====");
    for (const b of active) {
      const pool = await sumPoolOnMarket(supabase, b.id);
      console.log(`- ${b.id.slice(0, 8)}… ${b.title?.slice(0, 40)} → pool=${pool} P`);
    }
  }

  /** SIM_USER_IDS 로 기존 계정 쓰면 프로필 삭제 기본 false — SIM_CLEANUP_PROFILES=true 일 때만 삭제 */
  const cleanupProfiles =
    String(process.env.SIM_CLEANUP_PROFILES || "").toLowerCase() === "true" ||
    !process.env.SIM_USER_IDS?.trim();

  if (String(process.env.SIM_CLEANUP || "").toLowerCase() === "true") {
    await cleanup({ supabase, users, deleteProfiles: cleanupProfiles });
  } else {
    console.log("");
    console.log(`${LOG} cleanup skipped (set SIM_CLEANUP=true to delete sim rows)`);
  }
}

main().catch((e) => {
  console.error(LOG, "fatal", e);
  process.exitCode = 1;
});
