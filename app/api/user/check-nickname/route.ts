import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { RESERVED_NICKNAMES, isReservedNickname } from "@/lib/nickname-rules";

export const dynamic = "force-dynamic";

/**
 * GET /api/user/check-nickname?nickname=xxx&excludeId=uuid(optional)
 * 닉네임 사용 가능 여부를 확인합니다.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const nickname = String(searchParams.get("nickname") ?? "").trim();
    const excludeId = searchParams.get("excludeId") ?? "";

    if (!nickname) {
      return NextResponse.json({ ok: false, available: false, error: "닉네임을 입력해 주세요." });
    }
    if (nickname.length < 2) {
      return NextResponse.json({ ok: false, available: false, error: "닉네임은 2자 이상이어야 합니다." });
    }
    if (nickname.length > 20) {
      return NextResponse.json({ ok: false, available: false, error: "닉네임은 20자 이하여야 합니다." });
    }

    // 예약어 체크
    if (isReservedNickname(nickname)) {
      return NextResponse.json({
        ok: false,
        available: false,
        error: "사용할 수 없는 닉네임입니다.",
        reserved: true,
        reservedList: RESERVED_NICKNAMES,
      });
    }

    const svc = createServiceRoleClient();

    let query = svc.from("profiles").select("id").ilike("nickname", nickname);
    if (excludeId) query = query.neq("id", excludeId);
    const { data: existing } = await query.maybeSingle();

    if (existing) {
      return NextResponse.json({ ok: true, available: false, error: "이미 사용 중인 닉네임입니다." });
    }

    return NextResponse.json({ ok: true, available: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, available: false, error: msg }, { status: 500 });
  }
}
