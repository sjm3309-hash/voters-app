import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { isReservedNickname } from "@/lib/nickname-rules";
import { isAdminEmail } from "@/lib/admin";

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

    // 예약어 체크 — 운영자가 아닌 경우에만 차단
    const userIsAdmin = isAdminEmail(user.email);
    if (!userIsAdmin && isReservedNickname(nickname)) {
      return NextResponse.json(
        { ok: false, error: "사용할 수 없는 닉네임입니다." },
        { status: 400 },
      );
    }

    const svc = createServiceRoleClient();

    // 중복 닉네임 체크 (현재 유저 제외, 대소문자 무시)
    const { data: existing } = await svc
      .from("profiles")
      .select("id")
      .ilike("nickname", nickname)
      .neq("id", user.id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ ok: false, error: "nickname_taken" }, { status: 409 });
    }

    // 1. profiles 테이블 업데이트
    await svc.from("profiles").update({ nickname }).eq("id", user.id);

    // 2. auth 메타데이터 업데이트 (admin API 사용)
    await svc.auth.admin.updateUserById(user.id, {
      user_metadata: {
        ...((user.user_metadata as Record<string, unknown>) ?? {}),
        full_name: nickname,
        nickname,
        name: nickname,
      },
    });

    // 3. 과거 콘텐츠의 닉네임 일괄 업데이트 (병렬 처리)
    await Promise.allSettled([
      // 생성한 보트 creator 표시명
      svc.from("bets").update({ author_name: nickname }).eq("user_id", user.id),
      // 보트 댓글
      svc.from("boat_comments").update({ author_display: nickname }).eq("user_id", user.id),
      // 게시판 댓글
      svc.from("post_comments").update({ author_display: nickname }).eq("author_id", user.id),
      // 게시글 (author_id 컬럼이 있는 경우)
      svc.from("board_posts").update({ author_name: nickname }).eq("author_id", user.id),
    ]);

    return NextResponse.json({ ok: true, nickname });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
