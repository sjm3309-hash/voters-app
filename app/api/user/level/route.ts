/**
 * GET /api/user/level?name=<nickname>
 * 닉네임으로 유저의 레벨을 반환합니다. (인증 불필요 — 레벨 아이콘 표시용)
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

export async function GET(req: NextRequest) {
  const name = req.nextUrl.searchParams.get("name");
  if (!name || !name.trim()) {
    return NextResponse.json({ ok: false, error: "name required" }, { status: 400 });
  }

  try {
    const svc = createServiceRoleClient();
    const { data, error } = await svc
      .from("profiles")
      .select("level")
      .eq("nickname", name.trim())
      .maybeSingle();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    if (!data) {
      return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    }

    const row = data as { level?: unknown };
    const level = Math.max(1, Math.min(56, Math.floor(Number(row.level ?? 1))));
    return NextResponse.json({ ok: true, level });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
