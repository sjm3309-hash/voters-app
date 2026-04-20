/**
 * 이미 생성된 봇 10명에게 페블 지급 + 보트 참여
 *   npx tsx scripts/patch-bot-bets.ts
 */
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v?.trim()) throw new Error(`Missing env: ${name}`);
  return v.trim();
}

const INITIAL_PEBBLES = 50_000;
const BET_MIN = 500;
const BET_MAX = 3_000;
const BET_STEP = 100;

function randBet(): number {
  const steps = Math.floor((BET_MAX - BET_MIN) / BET_STEP);
  return BET_MIN + Math.floor(Math.random() * steps) * BET_STEP;
}

// 직전에 생성된 봇 10명 ID
const BOTS = [
  { id: "afa07fb5-9bfb-4036-ac17-4bc6560c1dd0", nickname: "스포츠광팬" },
  { id: "57aceac9-0930-455e-8bca-463ae50c29e9", nickname: "보트왕" },
  { id: "7ccd4f36-d67e-4ac2-bdfe-15639937482d", nickname: "예측달인" },
  { id: "240553e7-e0d1-46c6-a029-a11b1fda2878", nickname: "승부사킹" },
  { id: "bef89655-aa67-4e01-af6e-8d7cf6fa36b2", nickname: "분석가99" },
  { id: "f7be7cb4-0c0a-47b6-94e5-1c9403147956", nickname: "눈썰미짱" },
  { id: "51cc3773-104f-4a4b-a364-bedde59fd718", nickname: "페블헌터" },
  { id: "0e76fcdd-de97-40c0-a876-d9fb7486ff67", nickname: "보트마스터" },
  { id: "9a385c48-3c11-4696-bb67-5480b6195e17", nickname: "직관러" },
  { id: "4e4eea03-4085-4ae0-909e-e388a68b8378", nickname: "적중머신" },
];

async function main() {
  const svc = createClient(mustEnv("NEXT_PUBLIC_SUPABASE_URL"), mustEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 페블 지급 (UPDATE로 직접 덮어쓰기)
  console.log("페블 지급 중...");
  for (const bot of BOTS) {
    const { error } = await svc
      .from("profiles")
      .update({ nickname: bot.nickname, pebbles: INITIAL_PEBBLES })
      .eq("id", bot.id);
    if (error) console.warn(`  ⚠️  [${bot.nickname}] 프로필 오류:`, error.message);
    else console.log(`  ✅ ${bot.nickname} — ${INITIAL_PEBBLES.toLocaleString()}P 지급`);
  }

  // 열린 보트 조회
  const { data: openBets } = await svc
    .from("bets")
    .select("id, title, options, status, closing_at")
    .in("status", ["active", "open"])
    .order("created_at", { ascending: false })
    .limit(20);

  const activeBets = (openBets ?? []).filter((b) => {
    if (!b.closing_at) return true;
    return new Date(b.closing_at).getTime() > Date.now();
  });

  console.log(`\n참여 가능한 보트: ${activeBets.length}개\n보트 참여 시작...\n`);

  let totalBets = 0;
  for (const bot of BOTS) {
    const targetCount = Math.floor(Math.random() * 3) + 1;
    const shuffled = [...activeBets].sort(() => Math.random() - 0.5).slice(0, targetCount);

    for (const bet of shuffled) {
      let options: unknown[] = [];
      try {
        const raw = typeof bet.options === "string" ? JSON.parse(bet.options) : bet.options;
        options = Array.isArray(raw) ? raw : [];
      } catch { continue; }
      if (options.length === 0) continue;

      const optionIdx = Math.floor(Math.random() * options.length);
      const optionId  = `${bet.id}-opt-${optionIdx}`;
      const amount    = randBet();

      const { error } = await svc.rpc("place_bets_secure", {
        p_user_id: bot.id,
        p_boat_id: bet.id,
        p_bets: [{ option_id: optionId, amount }],
      });

      const label = (bet.title ?? bet.id).slice(0, 22);
      if (error) {
        console.warn(`  ⚠️  실패 [${bot.nickname} → ${label}]: ${error.message}`);
      } else {
        console.log(`  🎯 ${bot.nickname.padEnd(8)} → "${label}" | opt-${optionIdx} | ${amount.toLocaleString()}P`);
        totalBets++;
      }
      await new Promise((r) => setTimeout(r, 120));
    }
  }

  console.log(`\n✅ 완료! 총 ${totalBets}건 보트 참여`);
}

main().catch((e) => { console.error(e); process.exit(1); });
