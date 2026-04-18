import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import type { DislikeTargetType } from "@/lib/reports-config";

export type LikeTargetType = DislikeTargetType;

// ─── GET: 특정 대상의 좋아요 수 + 현재 유저 상태 ─────────────────────────────
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const targetType = url.searchParams.get("targetType") as LikeTargetType | null;
    const targetId   = url.searchParams.get("targetId");

    if (!targetType || !targetId) {
      return NextResponse.json({ ok: false, error: "missing_params" }, { status: 400 });
    }

    const supabase = createServiceRoleClient();
    const auth = await createClient();
    const { data: { user } } = await auth.auth.getUser();

    const { count } = await supabase
      .from("likes")
      .select("*", { count: "exact", head: true })
      .eq("target_type", targetType)
      .eq("target_id", targetId);

    let liked = false;
    if (user?.id) {
      const { data } = await supabase
        .from("likes")
        .select("id")
        .eq("target_type", targetType)
        .eq("target_id", targetId)
        .eq("user_id", user.id)
        .maybeSingle();
      liked = !!data;
    }

    return NextResponse.json({ ok: true, count: count ?? 0, liked });
  } catch (e) {
    console.error("[likes GET]", e);
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }
}

// ─── POST: 좋아요 토글 ────────────────────────────────────────────────────────
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
    const targetType = typeof o.targetType === "string" ? o.targetType as LikeTargetType : null;
    const targetId   = typeof o.targetId   === "string" ? o.targetId.trim() : null;

    const validTypes: LikeTargetType[] = ["boat", "boat_comment", "board_post", "board_comment"];
    if (!targetType || !validTypes.includes(targetType) || !targetId) {
      return NextResponse.json({ ok: false, error: "validation_failed" }, { status: 400 });
    }

    const supabase = createServiceRoleClient();

    const { data: existing } = await supabase
      .from("likes")
      .select("id")
      .eq("user_id", user.id)
      .eq("target_type", targetType)
      .eq("target_id", targetId)
      .maybeSingle();

    if (existing) {
      await supabase.from("likes").delete().eq("id", existing.id);
    } else {
      await supabase.from("likes").insert({
        user_id: user.id,
        target_type: targetType,
        target_id: targetId,
      });
    }

    const { count } = await supabase
      .from("likes")
      .select("*", { count: "exact", head: true })
      .eq("target_type", targetType)
      .eq("target_id", targetId);

    return NextResponse.json({ ok: true, liked: !existing, count: count ?? 0 });
  } catch (e) {
    console.error("[likes POST]", e);
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }
}
