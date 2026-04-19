/**
 * GET /api/user/levels?names=A,B,C
 * 여러 닉네임의 레벨을 한 번에 조회합니다. (인증 불필요 — 레벨 아이콘 표시용)
 * 최대 50개 닉네임까지 허용.
 */
import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
};

export async function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("names");
  if (!raw?.trim()) {
    return NextResponse.json({ ok: false, error: "names required" }, { status: 400 });
  }

  const names = raw
    .split(",")
    .map((n) => n.trim())
    .filter(Boolean)
    .slice(0, 50);

  if (names.length === 0) {
    return NextResponse.json({ ok: false, error: "no valid names" }, { status: 400 });
  }

  try {
    const svc = createServiceRoleClient();
    const { data, error } = await svc
      .from("profiles")
      .select("nickname, level")
      .in("nickname", names);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const levels: Record<string, number> = {};
    for (const row of (data ?? []) as { nickname: string; level?: unknown }[]) {
      if (row.nickname) {
        levels[row.nickname] = Math.max(1, Math.min(56, Math.floor(Number(row.level ?? 1))));
      }
    }

    return NextResponse.json({ ok: true, levels }, { headers: CACHE_HEADERS });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}
