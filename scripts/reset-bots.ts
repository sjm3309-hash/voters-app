/**
 * 봇 초기화: 베팅 내역 삭제 + 페블 수거 후 가입환영 3000P 지급
 * 닉네임 변경 + 성향 설정
 *   npx tsx scripts/reset-bots.ts
 */
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v?.trim()) throw new Error(`Missing env: ${name}`);
  return v.trim();
}

const WELCOME_PEBBLES = 3_000;

// 봇 ID + 새 닉네임 + 성향 설정
// checkin_days: 출석체크 간격(일), bet_style: 베팅 성향
const BOTS = [
  // ── 과감한 (2명): 매일 출석체크 ────────────────────────────────
  { id: "afa07fb5-9bfb-4036-ac17-4bc6560c1dd0", nickname: "한숨제조기", style: "과감형",   checkin_days: 1 },
  { id: "57aceac9-0930-455e-8bca-463ae50c29e9", nickname: "썬망",       style: "과감형",   checkin_days: 1 },
  // ── 안정적 (3명): 1~3일 출석체크 ───────────────────────────────
  { id: "7ccd4f36-d67e-4ac2-bdfe-15639937482d", nickname: "쿄쥬로",     style: "안정형",   checkin_days: 2 },
  { id: "240553e7-e0d1-46c6-a029-a11b1fda2878", nickname: "볼란티스",   style: "안정형",   checkin_days: 2 },
  { id: "bef89655-aa67-4e01-af6e-8d7cf6fa36b2", nickname: "가슴사슴",   style: "안정형",   checkin_days: 3 },
  // ── 평범한 (5명): 1~2일 출석체크 ───────────────────────────────
  { id: "f7be7cb4-0c0a-47b6-94e5-1c9403147956", nickname: "징징바",     style: "평범형",   checkin_days: 1 },
  { id: "51cc3773-104f-4a4b-a364-bedde59fd718", nickname: "총배설강",   style: "평범형",   checkin_days: 2 },
  { id: "0e76fcdd-de97-40c0-a876-d9fb7486ff67", nickname: "진짜대통령", style: "평범형",   checkin_days: 1 },
  { id: "9a385c48-3c11-4696-bb67-5480b6195e17", nickname: "김도시락",   style: "평범형",   checkin_days: 2 },
  { id: "4e4eea03-4085-4ae0-909e-e388a68b8378", nickname: "빌애크먼",   style: "평범형",   checkin_days: 2 },
];

const BOT_IDS = BOTS.map((b) => b.id);

async function main() {
  const svc = createClient(mustEnv("NEXT_PUBLIC_SUPABASE_URL"), mustEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── 1. bet_history 삭제 (bet_choice flavor 기준) ──────────────────────────
  console.log("1단계: 베팅 내역 삭제...");
  const { count: delCount, error: delErr } = await svc
    .from("bet_history")
    .delete({ count: "exact" })
    .in("user_id", BOT_IDS);

  if (delErr) console.warn("  ⚠️  bet_history 삭제 오류:", delErr.message);
  else console.log(`  ✅ bet_history ${delCount ?? 0}건 삭제`);

  // ── 2. 페블 수거 (0으로 초기화) ─────────────────────────────────────────
  console.log("\n2단계: 페블 수거...");
  const { error: zeroErr } = await svc
    .from("profiles")
    .update({ pebbles: 0 })
    .in("id", BOT_IDS);

  if (zeroErr) console.warn("  ⚠️  페블 수거 오류:", zeroErr.message);
  else console.log(`  ✅ 10명 페블 전액 수거`);

  // ── 3. 닉네임 변경 + 가입환영 3000P 지급 + 성향 메타데이터 저장 ─────────
  console.log("\n3단계: 닉네임 변경 + 3,000P 지급...");
  const today = new Date().toISOString().slice(0, 10);

  for (const bot of BOTS) {
    // 프로필: 닉네임 + 페블
    const { error: profErr } = await svc
      .from("profiles")
      .update({ nickname: bot.nickname, pebbles: WELCOME_PEBBLES })
      .eq("id", bot.id);

    if (profErr) {
      console.error(`  ❌ [${bot.nickname}] 프로필 오류:`, profErr.message);
      continue;
    }

    // auth user_metadata: 성향 + 출석 설정
    const { error: metaErr } = await (svc.auth as any).admin.updateUserById(bot.id, {
      user_metadata: {
        nickname: bot.nickname,
        is_bot: true,
        bot_style: bot.style,
        checkin_interval_days: bot.checkin_days,
        joined_at: today,
      },
    });

    if (metaErr) console.warn(`  ⚠️  [${bot.nickname}] 메타 오류:`, metaErr.message);

    // 출석체크 트랜잭션 기록 (가입 환영)
    void svc.from("pebble_transactions").insert({
      user_id: bot.id,
      amount: WELCOME_PEBBLES,
      balance_after: WELCOME_PEBBLES,
      type: "welcome_bonus",
      description: `🎉 가입 환영 보너스 — ${WELCOME_PEBBLES.toLocaleString()}P`,
    });

    const styleLabel = `${bot.style}(${bot.checkin_days}일 주기)`;
    console.log(`  ✅ ${bot.nickname.padEnd(8)} | ${styleLabel.padEnd(14)} | ${WELCOME_PEBBLES.toLocaleString()}P`);
  }

  // ── 4. 최종 확인 ────────────────────────────────────────────────────────
  console.log("\n4단계: 최종 확인...");
  const { data: profiles } = await svc
    .from("profiles")
    .select("id, nickname, pebbles")
    .in("id", BOT_IDS)
    .order("pebbles", { ascending: false });

  console.log("\n┌──────────────┬────────────┐");
  console.log("│ 닉네임       │ 페블       │");
  console.log("├──────────────┼────────────┤");
  for (const p of (profiles ?? []) as { nickname: string; pebbles: number }[]) {
    const name = String(p.nickname ?? "?").padEnd(12);
    const bal  = String(p.pebbles ?? 0).padStart(8);
    console.log(`│ ${name} │ ${bal}P │`);
  }
  console.log("└──────────────┴────────────┘");

  console.log("\n📋 성향 요약:");
  console.log("  과감형 (매일):  한숨제조기, 썬망");
  console.log("  안정형 (2~3일): 쿄쥬로, 볼란티스, 가슴사슴");
  console.log("  평범형 (1~2일): 징징바, 총배설강, 진짜대통령, 김도시락, 빌애크먼");
}

main().catch((e) => { console.error(e); process.exit(1); });
