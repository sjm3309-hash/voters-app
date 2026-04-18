/**
 * GET /api/user/profile-level
 * 로그인한 유저의 DB 레벨을 반환합니다.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const svc = createServiceRoleClient();
    const { data, error } = await svc
      .from("profiles")
      .select("level")
      .eq("id", user.id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const level = Math.max(1, Math.min(56, Math.floor(Number((data as { level?: unknown } | null)?.level ?? 1))));
    return NextResponse.json({ ok: true, level });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
