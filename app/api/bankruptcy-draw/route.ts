import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

type PrizeBand = {
  weight: number; // probability weight (0~1 sum=1)
  min: number;
  max: number;
  label: string;
};

const STEP = 100;
const COOLDOWN_DAYS = 7;

// “매운맛” 가중치
const BANDS: PrizeBand[] = [
  { weight: 0.7, min: 100, max: 500, label: "70% (100~500)" },
  { weight: 0.2, min: 600, max: 1000, label: "20% (600~1,000)" },
  { weight: 0.08, min: 1100, max: 3000, label: "8% (1,100~3,000)" },
  { weight: 0.019, min: 3100, max: 5000, label: "1.9% (3,100~5,000)" },
  { weight: 0.001, min: 5100, max: 10000, label: "0.1% (5,100~10,000 jackpot)" },
];

function floorToStep(n: number, step = STEP): number {
  return Math.floor(n / step) * step;
}

function randomIntInclusive(min: number, max: number): number {
  // inclusive integer range
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickBand(): PrizeBand {
  const r = Math.random();
  let acc = 0;
  for (const b of BANDS) {
    acc += b.weight;
    if (r < acc) return b;
  }
  // floating point safety
  return BANDS[BANDS.length - 1]!;
}

function pickAmountFromBand(band: PrizeBand): number {
  const raw = randomIntInclusive(band.min, band.max);
  // 요구사항: 무조건 100단위로 내림
  const stepped = floorToStep(raw, STEP);
  // stepped가 min 아래로 떨어질 수 있으므로 (예: min=5100, raw=5100 -> 5100 OK)
  // 안전하게 band 범위 내로 clamp
  return Math.min(band.max, Math.max(band.min, stepped));
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const svc = createServiceRoleClient();

    // 기존 유지: pebbles === 0 검증 + last_bankruptcy_draw_at 7일 쿨다운
    const { data: profile, error: pErr } = await svc
      .from("profiles")
      .select("id, pebbles, last_bankruptcy_draw_at")
      .eq("id", user.id)
      .maybeSingle();

    if (pErr) {
      return NextResponse.json(
        { ok: false, error: "profile_query_failed", details: { message: pErr.message, code: pErr.code } },
        { status: 500 },
      );
    }
    if (!profile?.id) {
      return NextResponse.json({ ok: false, error: "profile_not_found" }, { status: 404 });
    }

    const pebblesNow = Math.max(0, Number((profile as any).pebbles ?? 0));
    if (pebblesNow !== 0) {
      return NextResponse.json(
        { ok: false, error: "not_eligible", message: "페블 잔액이 0일 때만 제비뽑기를 할 수 있습니다." },
        { status: 400 },
      );
    }

    const now = new Date();
    const lastRaw = (profile as any).last_bankruptcy_draw_at as string | null | undefined;
    const lastMs = lastRaw ? Date.parse(lastRaw) : NaN;
    if (Number.isFinite(lastMs)) {
      const nextEligibleAt = addDays(new Date(lastMs), COOLDOWN_DAYS);
      if (now.getTime() < nextEligibleAt.getTime()) {
        return NextResponse.json(
          {
            ok: false,
            error: "cooldown",
            message: "제비뽑기는 7일에 1회만 가능합니다.",
            nextEligibleAt: nextEligibleAt.toISOString(),
          },
          { status: 400 },
        );
      }
    }

    const band = pickBand();
    const amount = pickAmountFromBand(band);
    const jackpot = band.weight === 0.001;

    // 기존 유지: profiles 테이블의 페블 잔액을 더하고 시간 업데이트
    const { error: uErr } = await svc
      .from("profiles")
      .update({
        pebbles: pebblesNow + amount,
        last_bankruptcy_draw_at: now.toISOString(),
      })
      .eq("id", user.id);

    if (uErr) {
      return NextResponse.json(
        { ok: false, error: "profile_update_failed", details: { message: uErr.message, code: uErr.code } },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      amount,
      band: { label: band.label, min: band.min, max: band.max },
      jackpot,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

