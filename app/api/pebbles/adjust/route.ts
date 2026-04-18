import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { isAdminEmail } from "@/lib/admin";
import { ADMIN_BALANCE } from "@/lib/points-constants";
import { adjustPebblesAtomic } from "@/lib/pebbles-db";

type Body = {
  delta?: number;
  description?: string;
};

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    if (isAdminEmail(user.email)) {
      return NextResponse.json({
        ok: true,
        balance: ADMIN_BALANCE,
        admin: true,
      });
    }

    const body = (await request.json().catch(() => null)) as Partial<Body> | null;
    const delta = Number(body?.delta);

    if (!Number.isFinite(delta) || Math.trunc(delta) !== delta || delta === 0) {
      return NextResponse.json({ ok: false, error: "invalid_delta" }, { status: 400 });
    }

    const result = await adjustPebblesAtomic(user.id, delta);

    if (!result.ok) {
      if (result.code === "insufficient_pebbles" || result.error.includes("insufficient_pebbles")) {
        return NextResponse.json(
          { ok: false, error: "insufficient_pebbles" },
          { status: 400 },
        );
      }
      return NextResponse.json(
        { ok: false, error: result.error },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      balance: result.balance,
      admin: false,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
