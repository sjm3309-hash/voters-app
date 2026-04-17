import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

const MAX_BET_PER_ONCE = 5000;
const MAX_BET_PER_DAY = 30000;
const MAX_BET_PER_WEEK = 150000;

type Body = {
  marketId: string;
  optionId: string;
  amount: number;
};

function startOfUtcDay(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
}

function startOfUtcWeekMonday(d = new Date()): Date {
  // Monday 00:00 UTC
  const day = d.getUTCDay(); // 0 Sun ... 6 Sat
  const diffToMonday = (day + 6) % 7; // Mon=0, Sun=6
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  monday.setUTCDate(monday.getUTCDate() - diffToMonday);
  return monday;
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as Partial<Body> | null;
    const marketId = String(body?.marketId ?? "").trim();
    const optionId = String(body?.optionId ?? "").trim();
    const amount = Math.floor(Number(body?.amount));

    if (!marketId || !optionId || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
    }

    if (amount > MAX_BET_PER_ONCE) {
      return NextResponse.json(
        { ok: false, error: "limit_once", message: "1회 최대 베팅 금액은 5,000 페블입니다." },
        { status: 400 },
      );
    }

    const now = new Date();
    const todayStart = startOfUtcDay(now).toISOString();
    const weekStart = startOfUtcWeekMonday(now).toISOString();

    // RLS 정책에 막히는 환경도 있어, 읽기/집계는 서비스 롤로 처리
    const svc = createServiceRoleClient();
    const { data: hist, error: hErr } = await svc
      .from("bet_history")
      .select("amount, created_at")
      .eq("user_id", user.id)
      .gte("created_at", weekStart);

    if (hErr) {
      return NextResponse.json(
        { ok: false, error: "history_query_failed", details: { message: hErr.message, code: hErr.code } },
        { status: 500 },
      );
    }

    let sumToday = 0;
    let sumWeek = 0;
    const todayMs = Date.parse(todayStart);
    for (const r of (hist ?? []) as { amount?: number | null; created_at?: string | null }[]) {
      const a = Number(r.amount ?? 0);
      if (!Number.isFinite(a) || a <= 0) continue;
      sumWeek += a;
      const t = r.created_at ? Date.parse(r.created_at) : NaN;
      if (Number.isFinite(t) && t >= todayMs) sumToday += a;
    }

    if (sumToday + amount > MAX_BET_PER_DAY) {
      return NextResponse.json(
        { ok: false, error: "limit_day", message: "일일 베팅 한도(30,000 페블)를 초과했습니다. 내일 다시 참여해 주세요." },
        { status: 400 },
      );
    }
    if (sumWeek + amount > MAX_BET_PER_WEEK) {
      return NextResponse.json(
        { ok: false, error: "limit_week", message: "주간 베팅 한도를 초과했습니다." },
        { status: 400 },
      );
    }

    // 실제 베팅 기록 저장 (서비스 롤로 upsert/insert)
    const { error: insErr } = await svc.from("bet_history").insert({
      market_id: marketId,
      option_id: optionId,
      user_id: user.id,
      amount,
    });

    if (insErr) {
      return NextResponse.json(
        { ok: false, error: "insert_failed", details: { message: insErr.message, code: insErr.code } },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      limits: {
        perOnce: MAX_BET_PER_ONCE,
        perDay: MAX_BET_PER_DAY,
        perWeek: MAX_BET_PER_WEEK,
      },
      totals: {
        today: sumToday + amount,
        week: sumWeek + amount,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

