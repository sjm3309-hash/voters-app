import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import type { ReportTargetType } from "@/lib/reports-config";

export type { ReportTargetType };
export { REPORT_REASONS } from "@/lib/reports-config";
export type { ReportReasonId } from "@/lib/reports-config";

// ─── POST: 신고 제출 ──────────────────────────────────────────────────────────
export async function POST(request: Request) {
  try {
    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try { body = await request.json(); } catch {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    const o = body as Record<string, unknown>;
    const targetType = typeof o.targetType === "string" ? o.targetType as ReportTargetType : null;
    const targetId   = typeof o.targetId   === "string" ? o.targetId.trim()   : null;
    const reason     = typeof o.reason     === "string" ? o.reason.trim()     : null;
    const detail     = typeof o.detail     === "string" ? o.detail.trim()     : null;

    const validTypes: ReportTargetType[] = ["boat", "boat_comment", "board_post", "board_comment"];
    if (!targetType || !validTypes.includes(targetType) || !targetId || !reason) {
      return NextResponse.json({ ok: false, error: "validation_failed" }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    // 동일 유저가 동일 대상을 이미 신고했는지 확인
    const { data: existing } = await supabase
      .from("reports")
      .select("id")
      .eq("reporter_id", user.id)
      .eq("target_type", targetType)
      .eq("target_id", targetId)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ ok: false, error: "already_reported", message: "이미 신고한 항목입니다." }, { status: 409 });
    }

    const { error } = await supabase.from("reports").insert({
      reporter_id: user.id,
      target_type: targetType,
      target_id: targetId,
      reason,
      detail: detail || null,
    });

    if (error) {
      console.error("[reports POST]", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[reports POST]", e);
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }
}
