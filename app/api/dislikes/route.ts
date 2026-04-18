import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import type { DislikeTargetType } from "@/lib/reports-config";

export type { DislikeTargetType };

// ─── GET: 특정 대상의 싫어요 수 + 현재 유저 상태 ─────────────────────────────
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const targetType = url.searchParams.get("targetType") as DislikeTargetType | null;
    const targetId   = url.searchParams.get("targetId");

    if (!targetType || !targetId) {
      return NextResponse.json({ ok: false, error: "missing_params" }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();

    const { count } = await supabase
      .from("dislikes")
      .select("*", { count: "exact", head: true })
      .eq("target_type", targetType)
      .eq("target_id", targetId);

    let disliked = false;
    if (user?.id) {
      const { data } = await supabase
        .from("dislikes")
        .select("id")
        .eq("target_type", targetType)
        .eq("target_id", targetId)
        .eq("user_id", user.id)
        .maybeSingle();
      disliked = !!data;
    }

    return NextResponse.json({ ok: true, count: count ?? 0, disliked });
  } catch (e) {
    console.error("[dislikes GET]", e);
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }
}

// ─── POST: 싫어요 토글 ────────────────────────────────────────────────────────
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
    const targetType = typeof o.targetType === "string" ? o.targetType as DislikeTargetType : null;
    const targetId   = typeof o.targetId   === "string" ? o.targetId.trim() : null;

    const validTypes: DislikeTargetType[] = ["boat", "boat_comment", "board_post", "board_comment"];
    if (!targetType || !validTypes.includes(targetType) || !targetId) {
      return NextResponse.json({ ok: false, error: "validation_failed" }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    const { data: existing } = await supabase
      .from("dislikes")
      .select("id")
      .eq("user_id", user.id)
      .eq("target_type", targetType)
      .eq("target_id", targetId)
      .maybeSingle();

    if (existing) {
      await supabase.from("dislikes").delete().eq("id", existing.id);
    } else {
      await supabase.from("dislikes").insert({
        user_id: user.id,
        target_type: targetType,
        target_id: targetId,
      });
    }

    const { count } = await supabase
      .from("dislikes")
      .select("*", { count: "exact", head: true })
      .eq("target_type", targetType)
      .eq("target_id", targetId);

    return NextResponse.json({ ok: true, disliked: !existing, count: count ?? 0 });
  } catch (e) {
    console.error("[dislikes POST]", e);
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }
}
