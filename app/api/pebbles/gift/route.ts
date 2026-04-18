import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { adjustPebblesAtomic } from "@/lib/pebbles-db";

type Body = {
  targetUserId?: string;
  amount?: number;
  reason?: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** 클라이언트 보상(좋아요 등)에서 다른 유저에게 페블 지급 — 세션 필요, 악용 방지 소액만 */
const MAX_GIFT_PER_REQUEST = 50_000;

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
    const targetUserId = String(body?.targetUserId ?? "").trim();
    const amount = Math.floor(Number(body?.amount));

    if (!UUID_RE.test(targetUserId)) {
      return NextResponse.json({ ok: false, error: "invalid_targetUserId" }, { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_GIFT_PER_REQUEST) {
      return NextResponse.json({ ok: false, error: "invalid_amount" }, { status: 400 });
    }

    const result = await adjustPebblesAtomic(targetUserId, amount);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
    }

    return NextResponse.json({ ok: true, balance: result.balance, targetUserId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
