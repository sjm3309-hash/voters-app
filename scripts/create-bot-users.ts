/**
 * 봇 유저 10명 생성 + 페블 지급 + 현재 열린 보트에 자동 참여
 *   npx tsx scripts/create-bot-users.ts
 */
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

dotenv.config({ path: ".env.local" });

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v?.trim()) throw new Error(`Missing env: ${name}`);
  return v.trim();
}

// ── 봇 설정 ────────────────────────────────────────────────────────────────
const BOT_NICKNAMES = [
  "스포츠광팬",
  "보트왕",
  "예측달인",
  "승부사킹",
  "분석가99",
  "눈썰미짱",
  "페블헌터",
  "보트마스터",
  "직관러",
  "적중머신",
];

const INITIAL_PEBBLES   = 50_000;   // 봇 초기 지급 페블
const BET_MIN           = 500;      // 최소 베팅
const BET_MAX           = 3_000;    // 최대 베팅 (5000 한도 미만으로 안전하게)
const BET_STEP          = 100;

function randBet(): number {
  const steps = Math.floor((BET_MAX - BET_MIN) / BET_STEP);
  return BET_MIN + Math.floor(Math.random() * steps) * BET_STEP;
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// ── 메인 ───────────────────────────────────────────────────────────────────
async function main() {
  const supabaseUrl = mustEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey  = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
  const svc = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // 1. 현재 열린 보트 목록 조회
  const { data: openBets, error: betsErr } = await svc
    .from("bets")
    .select("id, title, options, status, closing_at")
    .in("status", ["active", "open"])
    .order("created_at", { ascending: false })
    .limit(20);

  if (betsErr) throw new Error(`보트 조회 실패: ${betsErr.message}`);

  const activeBets = (openBets ?? []).filter((b) => {
    if (!b.closing_at) return true;
    return new Date(b.closing_at).getTime() > Date.now();
  });

  if (activeBets.length === 0) {
    console.warn("⚠️  현재 참여 가능한 열린 보트가 없습니다.");
  } else {
    console.log(`✅ 참여 가능한 보트: ${activeBets.length}개`);
    activeBets.forEach((b) => console.log(`   - [${b.id.slice(0, 8)}…] ${b.title ?? "(제목없음)"}`));
  }
  console.log();

  // bet_history flavor 감지
  const { data: flavorRow } = await svc
    .from("bet_history")
    .select("market_id, bet_id")
    .limit(1)
    .maybeSingle();
  const flavor: "market_option" | "bet_choice" =
    flavorRow && "market_id" in flavorRow ? "market_option" : "bet_choice";
  console.log(`bet_history flavor: ${flavor}\n`);

  const created: { id: string; nickname: string; email: string }[] = [];

  // 2. 봇 유저 생성
  for (const nickname of BOT_NICKNAMES) {
    const idx      = BOT_NICKNAMES.indexOf(nickname) + 1;
    const email    = `voters.bot${String(idx).padStart(2, "0")}.${Date.now()}@voters-bot.internal`;
    const password = `Bot!${crypto.randomBytes(10).toString("hex")}`;

    let userId: string | undefined;

    // Auth 유저 생성
    const { data: authData, error: authErr } = await (svc.auth as any).admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nickname, is_bot: true },
    });

    if (authErr || !authData?.user?.id) {
      console.error(`  ❌ Auth 생성 실패 [${nickname}]:`, authErr?.message ?? "unknown");
      continue;
    }
    userId = authData.user.id;

    // 닉네임 + 페블 프로필 업데이트 (트리거로 profiles 행이 생성된 후)
    await new Promise((r) => setTimeout(r, 300)); // 트리거 대기
    const { error: pebErr } = await svc
      .from("profiles")
      .upsert({ id: userId, nickname, pebbles: INITIAL_PEBBLES, welcome_bonus_claimed: true }, { onConflict: "id" });
    if (pebErr) console.warn(`  ⚠️  프로필 업데이트 실패 [${nickname}]:`, pebErr.message);

    created.push({ id: userId, nickname, email });
    console.log(`  ✅ 봇 생성: ${nickname} (${userId.slice(0, 8)}…) — ${INITIAL_PEBBLES.toLocaleString()}P 지급`);
  }

  console.log(`\n총 ${created.length}명 생성 완료. 이제 보트 참여를 시작합니다...\n`);

  if (activeBets.length === 0 || created.length === 0) return;

  // 3. 각 봇이 랜덤 보트에 참여
  let totalBets = 0;
  for (const bot of created) {
    // 봇마다 1~3개의 보트에 랜덤 참여
    const targetCount = Math.floor(Math.random() * 3) + 1;
    const shuffled    = [...activeBets].sort(() => Math.random() - 0.5).slice(0, targetCount);

    for (const bet of shuffled) {
      // 선택지 파싱
      let options: { id: string }[] = [];
      try {
        const raw = typeof bet.options === "string" ? JSON.parse(bet.options) : bet.options;
        options = Array.isArray(raw) ? raw : [];
      } catch { continue; }
      if (options.length === 0) continue;

      // 선택지 ID: {betId}-opt-{index} 형식 (앱 규칙 동일)
      const optionIdx = Math.floor(Math.random() * options.length);
      const optionId  = `${bet.id}-opt-${optionIdx}`;
      const amount    = randBet();

      // place_bets_secure RPC 호출
      const { error: rpcErr } = await svc.rpc("place_bets_secure", {
        p_user_id: bot.id,
        p_boat_id: bet.id,
        p_bets: [{ option_id: optionId, amount }],
      });

      if (rpcErr) {
        console.warn(`  ⚠️  베팅 실패 [${bot.nickname} → ${bet.title?.slice(0, 20)}]: ${rpcErr.message}`);
      } else {
        console.log(`  🎯 ${bot.nickname} → "${bet.title?.slice(0, 25) ?? bet.id.slice(0, 8)}" | ${chosenOption.id.slice(-4)} | ${amount.toLocaleString()}P`);
        totalBets++;
      }

      await new Promise((r) => setTimeout(r, 100)); // 과부하 방지
    }
  }

  console.log(`\n✅ 완료! 봇 ${created.length}명, 총 ${totalBets}건 보트 참여`);
  console.log("\n생성된 봇 목록:");
  created.forEach((b) => console.log(`  - ${b.nickname.padEnd(12)} | ${b.id} | ${b.email}`));
}

main().catch((e) => { console.error(e); process.exit(1); });
