import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => null)) as { nickname?: string } | null;
    const nickname = String(body?.nickname ?? "").trim();

    if (!nickname) {
      return NextResponse.json({ ok: false, error: "닉네임을 입력해 주세요." }, { status: 400 });
    }
    if (nickname.length < 2) {
      return NextResponse.json({ ok: false, error: "닉네임은 2자 이상이어야 합니다." }, { status: 400 });
    }
    if (nickname.length > 20) {
      return NextResponse.json({ ok: false, error: "닉네임은 20자 이하여야 합니다." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id) {
      return NextResponse.json({ ok: false, error: "로그인이 필요합니다." }, { status: 401 });
    }

    const svc = createServiceRoleClient();

    // 중복 닉네임 체크 (현재 유저 제외)
    const { data: existing } = await svc
      .from("profiles")
      .select("id")
      .ilike("nickname", nickname)
      .neq("id", user.id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ ok: false, error: "nickname_taken" }, { status: 409 });
    }

    // profiles 테이블 업데이트
    await svc.from("profiles").update({ nickname }).eq("id", user.id);

    // auth 메타데이터 업데이트 (admin API 사용)
    await svc.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...((user.user_metadata as Record<string, unknown>) ?? {}),
        full_name: nickname,
        nickname,
        name: nickname,
      },
    });

    return NextResponse.json({ ok: true, nickname });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
