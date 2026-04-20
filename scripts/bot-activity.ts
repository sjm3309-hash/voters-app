/**
 * 봇 활동 실행: 성향별 베팅 전략 적용
 *   npx tsx scripts/bot-activity.ts
 *
 * 성향별 전략:
 *   과감형 — 잔고의 60~80%, 3~4개 보트 참여
 *   안정형 — 잔고의 25~45%, 2~3개 보트 참여
 *   평범형 — 잔고의 10~30%, 1~3개 보트 참여
 */
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v?.trim()) throw new Error(`Missing env: ${name}`);
  return v.trim();
}

// ── 봇 목록 (닉네임·성향 업데이트 반영) ──────────────────────────────────────
const BOTS = [
  { id: "afa07fb5-9bfb-4036-ac17-4bc6560c1dd0", nickname: "한숨제조기", style: "과감형" },
  { id: "57aceac9-0930-455e-8bca-463ae50c29e9", nickname: "썬망",       style: "과감형" },
  { id: "7ccd4f36-d67e-4ac2-bdfe-15639937482d", nickname: "쿄쥬로",     style: "안정형" },
  { id: "240553e7-e0d1-46c6-a029-a11b1fda2878", nickname: "볼란티스",   style: "안정형" },
  { id: "bef89655-aa67-4e01-af6e-8d7cf6fa36b2", nickname: "가슴사슴",   style: "안정형" },
  { id: "f7be7cb4-0c0a-47b6-94e5-1c9403147956", nickname: "징징바",     style: "평범형" },
  { id: "51cc3773-104f-4a4b-a364-bedde59fd718", nickname: "총배설강",   style: "평범형" },
  { id: "0e76fcdd-de97-40c0-a876-d9fb7486ff67", nickname: "진짜대통령", style: "평범형" },
  { id: "9a385c48-3c11-4696-bb67-5480b6195e17", nickname: "김도시락",   style: "평범형" },
  { id: "4e4eea03-4085-4ae0-909e-e388a68b8378", nickname: "빌애크먼",   style: "평범형" },
] as const;

type Style = "과감형" | "안정형" | "평범형";

// ── 성향별 파라미터 ────────────────────────────────────────────────────────
const STRATEGY: Record<Style, { minRatio: number; maxRatio: number; minMarkets: number; maxMarkets: number }> = {
  과감형: { minRatio: 0.60, maxRatio: 0.80, minMarkets: 3, maxMarkets: 4 },
  안정형: { minRatio: 0.25, maxRatio: 0.45, minMarkets: 2, maxMarkets: 3 },
  평범형: { minRatio: 0.10, maxRatio: 0.30, minMarkets: 1, maxMarkets: 3 },
};

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

/** 페블 잔고와 성향을 고려해 한 보트에 베팅할 금액 산출 (100P 단위) */
function calcBetAmount(balance: number, style: Style, marketCount: number): number {
  const s = STRATEGY[style];
  const totalRatio = rand(s.minRatio, s.maxRatio);
  const perBet = Math.floor((balance * totalRatio) / marketCount / 100) * 100;
  return Math.max(100, perBet); // 최소 100P
}

async function main() {
  const svc = createClient(mustEnv("NEXT_PUBLIC_SUPABASE_URL"), mustEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── 1. 활성 보트 조회 ──────────────────────────────────────────────────────
  const { data: openBets, error: fetchErr } = await svc
    .from("bets")
    .select("id, title, options, status, closing_at")
    .in("status", ["active", "open"])
    .order("created_at", { ascending: false })
    .limit(30);

  if (fetchErr) { console.error("보트 조회 실패:", fetchErr.message); process.exit(1); }

  const activeBets = (openBets ?? []).filter((b) =>
    !b.closing_at || new Date(b.closing_at).getTime() > Date.now()
  );

  console.log(`📋 활성 보트: ${activeBets.length}개\n`);
  if (activeBets.length === 0) { console.log("참여할 보트 없음."); return; }

  // ── 2. 현재 페블 잔고 조회 ─────────────────────────────────────────────────
  const { data: profiles } = await svc
    .from("profiles")
    .select("id, pebbles")
    .in("id", BOTS.map((b) => b.id));

  const balanceMap = new Map<string, number>(
    (profiles ?? []).map((p: { id: string; pebbles: number }) => [p.id, p.pebbles])
  );

  // ── 3. 봇별 보트 참여 ────────────────────────────────────────────────────
  let totalBets = 0;
  const summary: string[] = [];

  for (const bot of BOTS) {
    const balance = balanceMap.get(bot.id) ?? 0;
    const s = STRATEGY[bot.style];

    if (balance < 100) {
      console.log(`⚠️  ${bot.nickname} — 잔고 부족 (${balance}P), 건너뜀`);
      continue;
    }

    // 참여할 보트 수 (잔고 여유에 따라 조정)
    const maxAffordable = Math.min(
      s.maxMarkets,
      Math.floor(balance / 100)
    );
    const marketCount = Math.max(
      s.minMarkets,
      Math.floor(rand(s.minMarkets, maxAffordable + 1))
    );

    const shuffled = [...activeBets].sort(() => Math.random() - 0.5).slice(0, marketCount);

    let botTotal = 0;
    const botLines: string[] = [];

    for (const bet of shuffled) {
      let options: unknown[] = [];
      try {
        const raw = typeof bet.options === "string" ? JSON.parse(bet.options) : bet.options;
        options = Array.isArray(raw) ? raw : [];
      } catch { continue; }
      if (options.length === 0) continue;

      const amount = calcBetAmount(balance, bot.style, shuffled.length);
      const optionIdx = Math.floor(Math.random() * options.length);
      const optionId  = `${bet.id}-opt-${optionIdx}`;

      const { error } = await svc.rpc("place_bets_secure", {
        p_user_id: bot.id,
        p_boat_id: bet.id,
        p_bets: [{ option_id: optionId, amount }],
      });

      const label = (bet.title ?? bet.id).slice(0, 24);
      if (error) {
        botLines.push(`  ❌ "${label}": ${error.message}`);
      } else {
        botLines.push(`  🎯 "${label}" → opt-${optionIdx} | ${amount.toLocaleString()}P`);
        botTotal += amount;
        totalBets++;
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    const tag = bot.style === "과감형" ? "🔥" : bot.style === "안정형" ? "🛡️" : "⚡";
    console.log(`${tag} ${bot.nickname} [${bot.style}] 잔고:${balance.toLocaleString()}P → ${botTotal.toLocaleString()}P 베팅`);
    botLines.forEach((l) => console.log(l));
    summary.push(`${bot.nickname}(${bot.style}) ${botTotal.toLocaleString()}P`);
  }

  // ── 4. 최종 집계 ────────────────────────────────────────────────────────
  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`✅ 완료! 총 ${totalBets}건 베팅 완료`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  summary.forEach((s) => console.log("  ", s));

  // ── 5. 최종 잔고 확인 ─────────────────────────────────────────────────────
  const { data: finalProfiles } = await svc
    .from("profiles")
    .select("nickname, pebbles")
    .in("id", BOTS.map((b) => b.id));

  console.log("\n📊 베팅 후 잔고:");
  for (const p of (finalProfiles ?? []) as { nickname: string; pebbles: number }[]) {
    console.log(`  ${String(p.nickname).padEnd(10)} ${p.pebbles.toLocaleString()}P`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
