import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { isAdminUserId } from "@/lib/admin";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json({ ok: false, error: "id_required" }, { status: 400 });
    }

    // 인증 확인
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user?.id || !isAdminUserId(user.id)) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 403 });
    }

    const svc = createServiceRoleClient();

    // 보트 존재 확인
    const { data: bet, error: fetchErr } = await svc
      .from("bets")
      .select("id, title, status")
      .eq("id", id)
      .maybeSingle();

    if (fetchErr || !bet) {
      return NextResponse.json(
        { ok: false, error: "not_found", message: "보트를 찾을 수 없습니다." },
        { status: 404 },
      );
    }

    // 연관 데이터 삭제
    await svc.from("bet_history").delete().eq("bet_id", id);
    await svc.from("boat_comments").delete().eq("bet_id", id);

    // 보트 삭제
    const { error: deleteErr } = await svc.from("bets").delete().eq("id", id);
    if (deleteErr) {
      return NextResponse.json(
        { ok: false, error: deleteErr.message },
        { status: 500 },
      );
    }

    return NextResponse.json({
      ok: true,
      message: `"${bet.title}" 보트가 삭제되었습니다.`,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
