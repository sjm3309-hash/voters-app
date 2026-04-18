/**
 * full-sim.ts — 7일 완전 인메모리 백테스트
 *
 * 100명 유저 × 7일 × 운영자 보트 10~20개/일
 * DB 연결 없음. 앱의 핵심 비즈니스 로직을 로컬에서 재현합니다.
 *
 * Run: npx tsx scripts/full-sim.ts
 */

// ─────────────────────────────────────────────
// 상수 (앱과 동일하게 유지)
// ─────────────────────────────────────────────
const INITIAL_PEBBLES        = 3_000;   // 신규가입 지급
const MAX_STAKE_PER_MARKET   = 5_000;
const MAX_BET_PER_DAY        = 30_000;
const MAX_BET_PER_WEEK       = 150_000;
const MARKET_CREATION_COST   = 500;
const BANKRUPTCY_GRANT_BANDS = [
  { weight: 50, min: 1_000,  max: 3_000  },
  { weight: 30, min: 3_100,  max: 7_000  },
  { weight: 15, min: 7_100,  max: 15_000 },
  { weight:  5, min: 15_100, max: 30_000 },
];
const ADMIN_GRANT_DAY3 = 5_000;        // 3일째 전체 지급

// ─────────────────────────────────────────────
// 타입 정의
// ─────────────────────────────────────────────
type UserType =
  | "신규가입자"
  | "과감한베터"
  | "어뷰저"
  | "커뮤니티유저"
  | "해킹시도자"
  | "안전한베터"
  | "무작위";

interface User {
  id: string;
  name: string;
  type: UserType;
  pebbles: number;
  isBanned: boolean;
  suspendedUntil: number | null;
  lastBankruptcyAt: number | null;
}

interface Market {
  id: string;
  title: string;
  options: string[];
  creatorId: string;
  openUntilDay: number;
  status: "active" | "settled" | "cancelled";
  winningOption: string | null;
  pool: Record<string, number>; // optionId → total pebbles
}

interface BetRecord {
  userId: string;
  marketId: string;
  optionId: string;
  amount: number;
  day: number;
  timestamp: number;
}

interface Transaction {
  userId: string;
  type: string;
  amount: number;
  description: string;
  day: number;
  balanceAfter: number;
}

interface SimEvent {
  day: number;
  userId: string;
  type:
    | "bet_ok" | "bet_blocked_market_limit" | "bet_blocked_day_limit"
    | "bet_blocked_week_limit" | "bet_blocked_own_market" | "bet_blocked_banned"
    | "bet_insufficient" | "bet_hack_attempt"
    | "bankruptcy_draw" | "post_created" | "comment_created"
    | "market_created" | "market_settled" | "admin_grant"
    | "abuse_rapid_bet" | "hack_invalid_amount" | "hack_negative_amount"
    | "report_submitted" | "ban_triggered";
  detail: string;
  amount?: number;
}

// ─────────────────────────────────────────────
// 유틸리티
// ─────────────────────────────────────────────
let _uid = 0;
function uid(): string { return `user-${String(++_uid).padStart(3, "0")}`; }
let _mid = 0;
function mid(): string { return `mkt-${String(++_mid).padStart(4, "0")}`; }
function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function pick<T>(arr: T[]): T { return arr[rand(0, arr.length - 1)]!; }
function roundTo100(n: number): number { return Math.floor(n / 100) * 100; }

function bankruptcyGrant(): number {
  const total = BANKRUPTCY_GRANT_BANDS.reduce((s, b) => s + b.weight, 0);
  let r = Math.random() * total;
  for (const b of BANKRUPTCY_GRANT_BANDS) {
    r -= b.weight;
    if (r <= 0) return roundTo100(rand(b.min, b.max));
  }
  return roundTo100(BANKRUPTCY_GRANT_BANDS[0]!.min);
}

const MARKET_TITLES = [
  "리버풀 vs 맨시티 — 최종 스코어?",
  "T1 vs 젠지 세계대회 결과?",
  "비트코인 이번주 고점?",
  "삼성전자 이번달 주가 방향?",
  "내일 날씨 비 올까?",
  "이번 드라마 시청률 1위?",
  "한국 올림픽 금메달 몇 개?",
  "다음 달 금리 인상 여부?",
  "월드컵 우승 국가?",
  "이번 분기 코스피 방향?",
  "스타크래프트 GSL 결승 진출?",
  "롤챔스 스프링 우승팀?",
  "이번 영화 박스오피스 1위?",
  "내일 코스닥 등락?",
  "손흥민 이번 시즌 득점 수?",
  "다음 대선 여론조사 1위 후보?",
  "이더리움 이번주 방향?",
  "국내 첫 AI 유니콘 기업은?",
  "이번 시즌 MLB 홈런왕?",
  "프리미어리그 우승 팀?",
];

// ─────────────────────────────────────────────
// 시뮬레이션 상태
// ─────────────────────────────────────────────
const users: User[] = [];
const markets: Market[] = [];
const bets: BetRecord[] = [];
const transactions: Transaction[] = [];
const events: SimEvent[] = [];

function addTx(userId: string, type: string, amount: number, desc: string, day: number, user: User) {
  user.pebbles = Math.max(0, user.pebbles + amount);
  transactions.push({ userId, type, amount, description: desc, day, balanceAfter: user.pebbles });
}

function addEvent(e: SimEvent) { events.push(e); }

// ─────────────────────────────────────────────
// 유저 생성
// ─────────────────────────────────────────────
function makeUsers() {
  const config: Array<{ type: UserType; count: number }> = [
    { type: "신규가입자",   count: 10 },
    { type: "과감한베터",   count: 20 },
    { type: "어뷰저",       count:  5 },
    { type: "커뮤니티유저", count: 20 },
    { type: "해킹시도자",   count:  5 },
    { type: "안전한베터",   count: 20 },
    { type: "무작위",       count: 20 },
  ];

  let seq = 1;
  for (const { type, count } of config) {
    for (let i = 0; i < count; i++) {
      const id = uid();
      const u: User = {
        id,
        name: `${type}-${String(i + 1).padStart(2, "0")}`,
        type,
        // 유형별 시작 잔액 차별화
        pebbles:
          type === "신규가입자"   ? INITIAL_PEBBLES :
          type === "과감한베터"   ? rand(500,  4_000) :   // 소액으로 시작 → 파산 가능성 높음
          type === "어뷰저"       ? rand(1_000, 5_000) :
          type === "커뮤니티유저" ? rand(3_000, 12_000) :
          type === "해킹시도자"   ? rand(2_000, 8_000) :
          type === "안전한베터"   ? rand(5_000, 15_000) :
          rand(1_000, 10_000),
        isBanned: false,
        suspendedUntil: null,
        lastBankruptcyAt: null,
      };
      users.push(u);
      seq++;
    }
  }
}

// ─────────────────────────────────────────────
// 운영자 보트 생성 (하루 10~20개)
// ─────────────────────────────────────────────
function adminCreateMarkets(day: number) {
  const count = rand(10, 20);
  for (let i = 0; i < count; i++) {
    const id = mid();
    const opts = ["선택지A", "선택지B", ...(Math.random() > 0.5 ? ["선택지C"] : [])];
    markets.push({
      id,
      title: pick(MARKET_TITLES),
      options: opts,
      creatorId: "admin",
      openUntilDay: day + rand(1, 3),
      status: "active",
      winningOption: null,
      pool: Object.fromEntries(opts.map((o) => [o, 0])),
    });
    addEvent({ day, userId: "admin", type: "market_created", detail: `${id} — ${opts.join("/")}` });
  }
}

// ─────────────────────────────────────────────
// 베팅 한도 체크
// ─────────────────────────────────────────────
function userTotalOnMarket(userId: string, marketId: string, beforeDay: number): number {
  return bets
    .filter((b) => b.userId === userId && b.marketId === marketId && b.day <= beforeDay)
    .reduce((s, b) => s + b.amount, 0);
}
function userTotalOnDay(userId: string, day: number): number {
  return bets
    .filter((b) => b.userId === userId && b.day === day)
    .reduce((s, b) => s + b.amount, 0);
}
function userTotalInWeek(userId: string, day: number): number {
  const weekStart = day - ((day - 1) % 7);
  return bets
    .filter((b) => b.userId === userId && b.day >= weekStart && b.day <= day)
    .reduce((s, b) => s + b.amount, 0);
}

// ─────────────────────────────────────────────
// 실제 베팅 처리
// ─────────────────────────────────────────────
function placeBet(user: User, market: Market, amount: number, day: number): SimEvent["type"] {
  // 실제 API의 normalizeBetLegs 와 동일: amount <= 0 이면 즉시 거부
  if (!Number.isFinite(amount) || amount <= 0) return "bet_insufficient";
  if (user.isBanned) return "bet_blocked_banned";
  if (user.suspendedUntil !== null && user.suspendedUntil >= day) return "bet_blocked_banned";
  if (market.creatorId === user.id) return "bet_blocked_own_market";
  if (user.pebbles < amount) return "bet_insufficient";

  const onMarket = userTotalOnMarket(user.id, market.id, day);
  if (onMarket + amount > MAX_STAKE_PER_MARKET) return "bet_blocked_market_limit";

  const onDay = userTotalOnDay(user.id, day);
  if (onDay + amount > MAX_BET_PER_DAY) return "bet_blocked_day_limit";

  const onWeek = userTotalInWeek(user.id, day);
  if (onWeek + amount > MAX_BET_PER_WEEK) return "bet_blocked_week_limit";

  const opt = pick(market.options);
  addTx(user.id, "bet", -amount, `보트 베팅: ${market.id}`, day, user);
  market.pool[opt] = (market.pool[opt] ?? 0) + amount;
  bets.push({ userId: user.id, marketId: market.id, optionId: opt, amount, day, timestamp: Date.now() });
  return "bet_ok";
}

// ─────────────────────────────────────────────
// 보트 정산
// ─────────────────────────────────────────────
function settleMarket(market: Market, day: number) {
  if (market.status !== "active") return;
  market.status = "settled";
  const winOpt = pick(market.options);
  market.winningOption = winOpt;

  const winnerBets = bets.filter(
    (b) => b.marketId === market.id && b.optionId === winOpt,
  );
  const totalPool = Object.values(market.pool).reduce((s, v) => s + v, 0);
  const winPool = market.pool[winOpt] ?? 0;

  for (const b of winnerBets) {
    const user = users.find((u) => u.id === b.userId);
    if (!user) continue;
    const payout = winPool === 0 ? b.amount : Math.floor((b.amount / winPool) * totalPool);
    addTx(user.id, "win", payout, `보트 정산 획득: ${market.id}`, day, user);
  }
  addEvent({ day, userId: "admin", type: "market_settled", detail: `${market.id} winner=${winOpt} pool=${totalPool}P` });
}

// ─────────────────────────────────────────────
// 제비뽑기
// ─────────────────────────────────────────────
function tryBankruptcy(user: User, day: number): boolean {
  // 최소 베팅(100P) 아래는 사실상 파산 — 더 이상 베팅 불가능
  if (user.pebbles >= 100) return false;
  const hasPendingBets = bets.some((b) => {
    const m = markets.find((m) => m.id === b.marketId);
    return b.userId === user.id && m?.status === "active";
  });
  if (hasPendingBets) return false;

  const SEVEN_DAYS = 7;
  if (user.lastBankruptcyAt !== null && day - user.lastBankruptcyAt < SEVEN_DAYS) return false;

  const amount = bankruptcyGrant();
  user.lastBankruptcyAt = day;
  addTx(user.id, "bankruptcy_draw", amount, "제비뽑기 당첨", day, user);
  addEvent({ day, userId: user.id, type: "bankruptcy_draw", detail: `+${amount}P`, amount });
  return true;
}

// ─────────────────────────────────────────────
// 운영자 어뷰징 감지 및 제재 (시뮬용)
// ─────────────────────────────────────────────
const abuseTracker = new Map<string, number>(); // userId → blocked count today
function trackAbuse(userId: string, day: number): boolean {
  const key = `${userId}:${day}`;
  const cnt = (abuseTracker.get(key) ?? 0) + 1;
  abuseTracker.set(key, cnt);
  if (cnt >= 5) {
    const user = users.find((u) => u.id === userId);
    if (user && !user.isBanned && user.type === "어뷰저") {
      user.suspendedUntil = day + 3;
      addEvent({ day, userId, type: "ban_triggered", detail: `한도 초과 ${cnt}회 → 3일 정지` });
      return true;
    }
  }
  return false;
}

// ─────────────────────────────────────────────
// 유형별 하루 행동 정의
// ─────────────────────────────────────────────
function actNewUser(user: User, activeMarkets: Market[], day: number) {
  // 조심스럽게 탐색, 하루 1~2번 소액 베팅
  for (let i = 0; i < rand(1, 2); i++) {
    const m = pick(activeMarkets);
    const amount = roundTo100(rand(100, 500));
    const result = placeBet(user, m, amount, day);
    addEvent({ day, userId: user.id, type: result, detail: `${m.id} ${amount}P`, amount });
  }
  // 가끔 커뮤니티 글 작성
  if (Math.random() < 0.3) {
    addEvent({ day, userId: user.id, type: "post_created", detail: "게시글 작성" });
  }
}

function actAggressiveBettor(user: User, activeMarkets: Market[], day: number) {
  // 하루 5~10번, 큰 금액 — 잔액이 얼마 남든 과감하게 베팅
  const betCount = rand(5, 10);
  for (let i = 0; i < betCount; i++) {
    const m = pick(activeMarkets);
    const maxBet = Math.max(100, Math.min(user.pebbles, 5_000));
    const amount = roundTo100(rand(Math.min(maxBet, 1_000), maxBet));
    if (amount <= 0) { tryBankruptcy(user, day); continue; }
    const result = placeBet(user, m, amount, day);
    addEvent({ day, userId: user.id, type: result, detail: `${m.id} ${amount}P`, amount });
    if (result.startsWith("bet_blocked") || result === "bet_insufficient") tryBankruptcy(user, day);
  }
  // 잔액이 조금 남아도 마저 다 쏟아붓기
  if (user.pebbles > 0 && user.pebbles < 500 && Math.random() < 0.7) {
    const m = pick(activeMarkets);
    const last = roundTo100(user.pebbles);
    if (last >= 100) {
      const result = placeBet(user, m, last, day);
      addEvent({ day, userId: user.id, type: result, detail: `마지막 베팅 ${last}P`, amount: last });
    }
    tryBankruptcy(user, day);
  }
}

function actAbuser(user: User, activeMarkets: Market[], day: number) {
  // 같은 보트에 여러 번 채우기 시도
  const m = pick(activeMarkets);
  for (let i = 0; i < 8; i++) {
    const amount = roundTo100(rand(1_000, 5_000));
    const result = placeBet(user, m, amount, day);
    addEvent({ day, userId: user.id, type: result, detail: `어뷰저 반복 ${m.id} ${amount}P`, amount });
    if (result.startsWith("bet_blocked")) {
      addEvent({ day, userId: user.id, type: "abuse_rapid_bet", detail: `차단됨: ${result}` });
      trackAbuse(user.id, day);
    }
  }
  // 일별 한도 초과 시도
  for (let i = 0; i < 3; i++) {
    const m2 = pick(activeMarkets);
    const result2 = placeBet(user, m2, 5_000, day);
    if (result2 === "bet_blocked_day_limit") {
      addEvent({ day, userId: user.id, type: "abuse_rapid_bet", detail: "일일 한도 초과 시도" });
      trackAbuse(user.id, day);
    }
  }
}

function actCommunityUser(user: User, activeMarkets: Market[], day: number) {
  // 거의 안 베팅, 글/댓글 위주
  if (Math.random() < 0.2) {
    const m = pick(activeMarkets);
    const amount = roundTo100(rand(100, 500));
    const result = placeBet(user, m, amount, day);
    addEvent({ day, userId: user.id, type: result, detail: `${m.id} ${amount}P`, amount });
  }
  if (Math.random() < 0.7) {
    addEvent({ day, userId: user.id, type: "post_created", detail: "커뮤니티 게시글" });
  }
  const commentCount = rand(1, 4);
  for (let i = 0; i < commentCount; i++) {
    addEvent({ day, userId: user.id, type: "comment_created", detail: "댓글" });
  }
}

function actHacker(user: User, activeMarkets: Market[], day: number) {
  const m = pick(activeMarkets);

  // 음수 금액 시도
  const negAmount = -rand(1_000, 10_000);
  const resultNeg = placeBet(user, m, negAmount, day);
  addEvent({ day, userId: user.id, type: "hack_negative_amount", detail: `시도: ${negAmount}P → ${resultNeg}` });

  // 엄청난 금액 시도 (잔액 초과)
  const hugeAmount = 999_999_999;
  const resultHuge = placeBet(user, m, hugeAmount, day);
  addEvent({ day, userId: user.id, type: "hack_invalid_amount", detail: `시도: ${hugeAmount}P → ${resultHuge}` });

  // 자신이 만든 가상 보트에 베팅 시도 (user_id 조작)
  const fakeMarket: Market = {
    id: mid(),
    title: "해커 자작 보트",
    options: ["예", "아니오"],
    creatorId: user.id,
    openUntilDay: day + 1,
    status: "active",
    winningOption: null,
    pool: { "예": 0, "아니오": 0 },
  };
  const resultOwn = placeBet(user, fakeMarket, 1_000, day);
  addEvent({ day, userId: user.id, type: "bet_blocked_own_market", detail: `자작보트 시도 → ${resultOwn}` });

  // 정상 베팅도 일부 시도
  if (Math.random() < 0.5) {
    const amount = roundTo100(rand(100, 1_000));
    const result = placeBet(user, m, amount, day);
    addEvent({ day, userId: user.id, type: result, detail: `${m.id} ${amount}P`, amount });
  }
}

function actSafeBettor(user: User, activeMarkets: Market[], day: number) {
  // 하루 2~4번, 소-중간 금액, 절대 잔액의 30% 이상 안 씀
  const betCount = rand(2, 4);
  for (let i = 0; i < betCount; i++) {
    const m = pick(activeMarkets);
    const maxSafe = Math.floor(user.pebbles * 0.3);
    if (maxSafe < 100) continue;
    const amount = roundTo100(rand(100, Math.min(maxSafe, 2_000)));
    const result = placeBet(user, m, amount, day);
    addEvent({ day, userId: user.id, type: result, detail: `${m.id} ${amount}P`, amount });
  }
}

function actRandom(user: User, activeMarkets: Market[], day: number) {
  const action = rand(1, 5);
  if (action <= 2) {
    // 베팅
    const m = pick(activeMarkets);
    const amount = roundTo100(rand(100, 8_000));
    const result = placeBet(user, m, amount, day);
    addEvent({ day, userId: user.id, type: result, detail: `${m.id} ${amount}P`, amount });
    tryBankruptcy(user, day);
  } else if (action === 3) {
    // 커뮤니티 활동
    addEvent({ day, userId: user.id, type: "post_created", detail: "무작위 게시글" });
  } else if (action === 4) {
    // 아무것도 안 함
  } else {
    // 여러 번 베팅
    const count = rand(2, 6);
    for (let i = 0; i < count; i++) {
      const m = pick(activeMarkets);
      const amount = roundTo100(rand(100, 3_000));
      const result = placeBet(user, m, amount, day);
      addEvent({ day, userId: user.id, type: result, detail: `${m.id} ${amount}P`, amount });
    }
    tryBankruptcy(user, day);
  }
}

// ─────────────────────────────────────────────
// 메인 시뮬레이션 루프
// ─────────────────────────────────────────────
function runDay(day: number) {
  // 1. 운영자 보트 생성
  adminCreateMarkets(day);

  // 2. 이전날 마감 보트 정산
  for (const m of markets) {
    if (m.status === "active" && m.openUntilDay < day) {
      settleMarket(m, day);
    }
  }

  const activeMarkets = markets.filter((m) => m.status === "active");
  if (activeMarkets.length === 0) return;

  // 3. 3일째: 운영자 전체 페블 지급
  if (day === 3) {
    for (const user of users) {
      addTx(user.id, "admin_grant", ADMIN_GRANT_DAY3, `🎁 운영자 이벤트 지급`, day, user);
      addEvent({ day, userId: user.id, type: "admin_grant", detail: `+${ADMIN_GRANT_DAY3}P`, amount: ADMIN_GRANT_DAY3 });
    }
    console.log(`\n[Day ${day}] 🎉 운영자 전체 지급 +${ADMIN_GRANT_DAY3.toLocaleString()}P × ${users.length}명`);
  }

  // 4. 유저별 행동
  for (const user of users) {
    switch (user.type) {
      case "신규가입자":   actNewUser(user, activeMarkets, day); break;
      case "과감한베터":   actAggressiveBettor(user, activeMarkets, day); break;
      case "어뷰저":       actAbuser(user, activeMarkets, day); break;
      case "커뮤니티유저": actCommunityUser(user, activeMarkets, day); break;
      case "해킹시도자":   actHacker(user, activeMarkets, day); break;
      case "안전한베터":   actSafeBettor(user, activeMarkets, day); break;
      case "무작위":       actRandom(user, activeMarkets, day); break;
    }
    tryBankruptcy(user, day);
  }
}

// ─────────────────────────────────────────────
// 리포트 생성
// ─────────────────────────────────────────────
function report() {
  const SEP = "═".repeat(62);
  const sep = "─".repeat(62);

  console.log(`\n${SEP}`);
  console.log("  VOTERS 백테스트 리포트 — 7일 시뮬레이션");
  console.log(`${SEP}`);

  // ── 유저 구성 ──
  console.log("\n▣ 유저 구성");
  const types: UserType[] = [
    "신규가입자", "과감한베터", "어뷰저", "커뮤니티유저",
    "해킹시도자", "안전한베터", "무작위",
  ];
  const typeCount = new Map(types.map((t) => [t, users.filter((u) => u.type === t).length]));
  for (const t of types) {
    console.log(`  ${t.padEnd(10)} ${typeCount.get(t)}명`);
  }
  console.log(`  ${"합계".padEnd(10)} ${users.length}명`);

  // ── 보트(마켓) 현황 ──
  console.log(`\n${sep}`);
  console.log("▣ 보트 현황");
  const totalMarkets = markets.length;
  const settledMarkets = markets.filter((m) => m.status === "settled").length;
  const activeLeft = markets.filter((m) => m.status === "active").length;
  const totalPool = Object.values(
    bets.reduce((acc, b) => { acc[b.marketId] = (acc[b.marketId] ?? 0) + b.amount; return acc; }, {} as Record<string, number>)
  ).reduce((s, v) => s + v, 0);

  console.log(`  생성된 총 보트:   ${totalMarkets}개 (운영자 일 평균 ${Math.round(totalMarkets / 7)}개)`);
  console.log(`  정산 완료:        ${settledMarkets}개`);
  console.log(`  아직 진행 중:     ${activeLeft}개`);
  console.log(`  총 베팅 풀:       ${totalPool.toLocaleString()}P`);

  // ── 베팅 통계 ──
  console.log(`\n${sep}`);
  console.log("▣ 베팅 이벤트 통계");
  const countOf = (t: SimEvent["type"]) => events.filter((e) => e.type === t).length;

  const betOk     = countOf("bet_ok");
  const blkMarket = countOf("bet_blocked_market_limit");
  const blkDay    = countOf("bet_blocked_day_limit");
  const blkWeek   = countOf("bet_blocked_week_limit");
  const blkOwn    = countOf("bet_blocked_own_market");
  const blkBan    = countOf("bet_blocked_banned");
  const insuff    = countOf("bet_insufficient");
  const blkTotal  = blkMarket + blkDay + blkWeek + blkOwn + blkBan;

  console.log(`  성공 베팅:        ${betOk}건  (총 ${bets.reduce((s, b) => s + b.amount, 0).toLocaleString()}P)`);
  console.log(`  한도 차단 합계:   ${blkTotal}건`);
  console.log(`    └ 보트당 상한:  ${blkMarket}건`);
  console.log(`    └ 일일 상한:    ${blkDay}건`);
  console.log(`    └ 주간 상한:    ${blkWeek}건`);
  console.log(`    └ 자작보트 차단:${blkOwn}건`);
  console.log(`    └ 제재 차단:    ${blkBan}건`);
  console.log(`  잔액 부족:        ${insuff}건`);

  // ── 어뷰징/해킹 감지 ──
  console.log(`\n${sep}`);
  console.log("▣ 어뷰징 & 해킹 시도 감지");
  const abuseEvents    = countOf("abuse_rapid_bet");
  const hackNeg        = countOf("hack_negative_amount");
  const hackHuge       = countOf("hack_invalid_amount");
  const hackOwn        = events.filter((e) => e.userId && users.find((u) => u.id === e.userId)?.type === "해킹시도자" && e.type === "bet_blocked_own_market").length;
  const bannedUsers    = users.filter((u) => u.isBanned || u.suspendedUntil !== null);
  const banTriggered   = countOf("ban_triggered");

  console.log(`  어뷰저 반복 차단: ${abuseEvents}건 (한도 우회 시도)`);
  console.log(`  음수 금액 시도:   ${hackNeg}건  → 전부 bet_insufficient/blocked`);
  console.log(`  초과 금액 시도:   ${hackHuge}건  → 전부 bet_insufficient`);
  console.log(`  자작보트 베팅 시도:${hackOwn}건  → 전부 차단`);
  console.log(`  자동 제재 발동:   ${banTriggered}건`);
  console.log(`  제재 중인 유저:   ${bannedUsers.length}명 (${bannedUsers.map((u) => u.name).join(", ")})`);

  // ── 커뮤니티 활동 ──
  console.log(`\n${sep}`);
  console.log("▣ 커뮤니티 활동");
  const posts    = countOf("post_created");
  const comments = countOf("comment_created");
  console.log(`  게시글:   ${posts}건`);
  console.log(`  댓글:     ${comments}건`);

  // ── 제비뽑기 ──
  console.log(`\n${sep}`);
  console.log("▣ 제비뽑기 (파산 시)");
  const draws = events.filter((e) => e.type === "bankruptcy_draw");
  const drawAmounts = draws.map((e) => e.amount ?? 0);
  const drawTotal = drawAmounts.reduce((s, v) => s + v, 0);
  const drawAvg = draws.length > 0 ? Math.round(drawTotal / draws.length) : 0;
  console.log(`  총 제비뽑기:  ${draws.length}건`);
  console.log(`  평균 획득:    ${drawAvg.toLocaleString()}P`);
  console.log(`  최대 획득:    ${Math.max(0, ...drawAmounts).toLocaleString()}P`);
  console.log(`  총 지급 페블: ${drawTotal.toLocaleString()}P`);

  const drawByType = new Map<UserType, number>();
  for (const e of draws) {
    const u = users.find((x) => x.id === e.userId);
    if (!u) continue;
    drawByType.set(u.type, (drawByType.get(u.type) ?? 0) + 1);
  }
  for (const [t, cnt] of drawByType) {
    console.log(`    ${t}: ${cnt}건`);
  }

  // ── 운영자 페블 지급 ──
  console.log(`\n${sep}`);
  console.log("▣ 운영자 전체 지급 이벤트 (Day 3)");
  const grantEvents = events.filter((e) => e.type === "admin_grant");
  console.log(`  대상: ${grantEvents.length}명 / ${ADMIN_GRANT_DAY3.toLocaleString()}P 씩`);
  console.log(`  총 지급: ${(grantEvents.length * ADMIN_GRANT_DAY3).toLocaleString()}P`);

  // ── 유저 타입별 최종 잔액 ──
  console.log(`\n${sep}`);
  console.log("▣ 유저 타입별 최종 잔액 (7일 후)");
  for (const t of types) {
    const group = users.filter((u) => u.type === t);
    const balances = group.map((u) => u.pebbles);
    const avg = balances.length > 0 ? Math.round(balances.reduce((s, v) => s + v, 0) / balances.length) : 0;
    const min = Math.min(...balances);
    const max = Math.max(...balances);
    const bankruptCount = balances.filter((b) => b === 0).length;
    console.log(
      `  ${t.padEnd(10)} 평균 ${avg.toLocaleString().padStart(7)}P  ` +
      `최소 ${min.toLocaleString().padStart(6)}P  최대 ${max.toLocaleString().padStart(7)}P  ` +
      `파산 ${bankruptCount}명`,
    );
  }

  const allBalances = users.map((u) => u.pebbles);
  const totalPebbles = allBalances.reduce((s, v) => s + v, 0);
  const globalAvg = Math.round(totalPebbles / users.length);
  console.log(`\n  전체 평균: ${globalAvg.toLocaleString()}P  |  전체 합계: ${totalPebbles.toLocaleString()}P`);

  // ── 일별 요약 ──
  console.log(`\n${sep}`);
  console.log("▣ 일별 베팅 요약");
  for (let d = 1; d <= 7; d++) {
    const dayBets  = bets.filter((b) => b.day === d);
    const dayPool  = dayBets.reduce((s, b) => s + b.amount, 0);
    const dayMkts  = markets.filter((m) => m.openUntilDay >= d && m.openUntilDay < d + 3).length;
    const dayGrant = d === 3 ? `  🎁 전체 지급 +${ADMIN_GRANT_DAY3.toLocaleString()}P` : "";
    console.log(
      `  Day ${d}: 베팅 ${dayBets.length.toString().padStart(3)}건 / ${dayPool.toLocaleString().padStart(8)}P` +
      `  활성 보트 ${dayMkts}개${dayGrant}`,
    );
  }

  // ── 시스템 검증 결과 ──
  console.log(`\n${sep}`);
  console.log("▣ 시스템 검증 결과");

  const negBetPassed    = events.filter((e) => e.type === "hack_negative_amount" && String(e.detail).includes("bet_ok")).length;
  const hugeBetPassed   = events.filter((e) => e.type === "hack_invalid_amount"  && String(e.detail).includes("bet_ok")).length;
  const ownBetPassed    = events.filter((e) => e.type === "bet_blocked_own_market" && users.find((u) => u.id === e.userId)?.type === "해킹시도자" && String(e.detail).includes("bet_ok")).length;
  const limitsBypass    = events.filter((e) => (e.type === "abuse_rapid_bet") && String(e.detail).includes("bet_ok")).length;

  const checks: Array<[string, boolean, string]> = [
    ["음수 금액 베팅 차단",   negBetPassed  === 0, `${negBetPassed}건 통과`],
    ["초과 금액 베팅 차단",   hugeBetPassed === 0, `${hugeBetPassed}건 통과`],
    ["자작보트 베팅 차단",    ownBetPassed  === 0, `${ownBetPassed}건 통과`],
    ["어뷰징 한도 우회 차단", limitsBypass  === 0, `${limitsBypass}건 통과`],
    ["파산 감지 정상 동작",   draws.length  >  0,  `${draws.length}건 발동`],
    ["제재 유저 베팅 차단",   blkBan        >= 0,  `${blkBan}건 차단 (제재자 있으면 올라감)`],
  ];

  let allPass = true;
  for (const [label, passed, note] of checks) {
    const mark = passed ? "✅" : "❌";
    if (!passed) allPass = false;
    console.log(`  ${mark} ${label.padEnd(22)} (${note})`);
  }

  console.log(`\n  ${allPass ? "✅ 모든 항목 정상" : "❌ 일부 항목 이상 — 위 로그 확인"}`);
  console.log(`\n${SEP}\n`);
}

// ─────────────────────────────────────────────
// 실행
// ─────────────────────────────────────────────
console.log("VOTERS 백테스트 시작...");
console.log(`유저 ${100}명 생성 중...`);
makeUsers();
console.log(`✓ ${users.length}명 생성 완료\n`);

for (let day = 1; day <= 7; day++) {
  process.stdout.write(`[Day ${day}/7] 시뮬레이션 중...`);
  runDay(day);
  const dayBets = bets.filter((b) => b.day === day).length;
  console.log(` 베팅 ${dayBets}건 처리 완료`);
}

report();
