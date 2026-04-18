import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

/**
 * POST /api/pebbles/level
 * 로그인한 유저의 profiles.level 을 DB에 동기화합니다.
 * 클라이언트에서 레벨업 직후 호출합니다.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as { level?: unknown } | null;
    const raw = Number(body?.level);
    if (!Number.isFinite(raw) || raw < 1 || raw > 56) {
      return NextResponse.json({ ok: false, error: "invalid_level" }, { status: 400 });
    }
    const level = Math.floor(raw);

    const svc = createServiceRoleClient();
    const { error } = await svc
      .from("profiles")
      .upsert({ id: user.id, level }, { onConflict: "id" });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, level });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
