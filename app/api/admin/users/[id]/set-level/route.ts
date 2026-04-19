/**
 * POST /api/admin/users/[id]/set-level
 *
 * 관리자 전용 — 특정 유저의 레벨을 직접 설정합니다.
 * - level: 1~56 정수
 * - resetRewardDate: true 이면 last_reward_date 를 null 로 초기화 (오늘 출석 보상 다시 받을 수 있게)
 */
import { NextResponse } from "next/server";
import { requireAdminJson } from "@/app/api/admin/_auth";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdminJson();
  if (!gate.ok) return gate.response;

  const { id: userId } = await context.params;
  if (!userId?.trim()) {
    return NextResponse.json({ ok: false, error: "user_id required" }, { status: 400 });
  }

  const body = (await request.json().catch(() => null)) as {
    level?: unknown;
    resetRewardDate?: unknown;
  } | null;

  const rawLevel = Number(body?.level);
  if (!Number.isFinite(rawLevel) || rawLevel < 1 || rawLevel > 56) {
    return NextResponse.json(
      { ok: false, error: "level must be an integer between 1 and 56" },
      { status: 400 },
    );
  }
  const level = Math.floor(rawLevel);
  const resetRewardDate = body?.resetRewardDate === true;

  const svc = createServiceRoleClient();

  // profiles 행이 있는지 확인
  const { data: existing, error: selErr } = await svc
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (selErr) {
    return NextResponse.json({ ok: false, error: selErr.message }, { status: 500 });
  }

  if (!existing) {
    // 프로필 행이 없으면 먼저 생성
    const { error: insErr } = await svc
      .from("profiles")
      .insert({ id: userId, level, pebbles: 0 });
    if (insErr) {
      return NextResponse.json({ ok: false, error: insErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, level, resetRewardDate: false });
  }

  // 업데이트할 필드 구성
  const updatePayload: Record<string, unknown> = { level };
  if (resetRewardDate) {
    updatePayload.last_reward_date = null;
  }

  const { error: upErr } = await svc
    .from("profiles")
    .update(updatePayload)
    .eq("id", userId);

  if (upErr) {
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, level, resetRewardDate });
}
