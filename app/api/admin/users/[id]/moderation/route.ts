import { NextResponse } from "next/server";
import { requireAdminJson } from "@/app/api/admin/_auth";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { adjustPebblesAtomic } from "@/lib/pebbles-db";
import { isAdminEmail } from "@/lib/admin";
import { isAdminUserId } from "@/lib/admin";

type Body = {
  action: "ban" | "unban" | "suspend" | "unsuspend" | "deduct";
  /** suspend: 정지 일수 */
  days?: number;
  /** deduct: 차감할 페블 수량 */
  amount?: number;
  reason?: string;
};

/**
 * GET  /api/admin/users/[id]/moderation — 현재 제재 상태 조회
 * POST /api/admin/users/[id]/moderation — 제재 적용
 *   body.action: "ban" | "unban" | "suspend" | "unsuspend" | "deduct"
 */
export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminJson();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  try {
    const svc = createServiceRoleClient();
    const { data, error } = await svc
      .from("user_moderation")
      .select("*")
      .eq("user_id", id)
      .maybeSingle();

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, moderation: data ?? null });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminJson();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ ok: false, error: "missing id" }, { status: 400 });
  }

  // 어드민 계정은 제재 불가
  if (isAdminUserId(id)) {
    return NextResponse.json({ ok: false, error: "운영자 계정은 제재할 수 없습니다." }, { status: 403 });
  }

  // 이메일 확인 (서비스 롤)
  try {
    const svc = createServiceRoleClient();
    const { data: userAuth } = await svc.auth.admin.getUserById(id);
    if (userAuth?.user?.email && isAdminEmail(userAuth.user.email)) {
      return NextResponse.json({ ok: false, error: "운영자 계정은 제재할 수 없습니다." }, { status: 403 });
    }
  } catch { /* 무시 */ }

  const body = (await request.json().catch(() => null)) as Partial<Body> | null;
  const action = body?.action;

  if (!action) {
    return NextResponse.json({ ok: false, error: "action 필드가 필요합니다." }, { status: 400 });
  }

  try {
    const svc = createServiceRoleClient();

    if (action === "deduct") {
      const amount = Math.floor(Number(body?.amount ?? 0));
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ ok: false, error: "유효한 차감 페블 수를 입력하세요." }, { status: 400 });
      }
      const r = await adjustPebblesAtomic(id, -amount);
      if (!r.ok) {
        return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
      }
      // pebble_transactions 기록
      const svc2 = createServiceRoleClient();
      const reason2 = String(body?.reason ?? "").trim() || "운영자 차감";
      await svc2.from("pebble_transactions").insert({
        user_id: id,
        amount: -amount,
        balance_after: r.balance,
        type: "admin_deduct",
        description: `🔻 운영자 차감 · ${reason2}`,
      });
      // 알림
      await svc2.from("notifications").insert({
        user_id: id,
        message: `⚠️ 운영자에 의해 페블이 차감되었습니다\n페블: ${amount.toLocaleString()} P\n사유: ${reason2}`,
        link: null,
        is_read: false,
      });
      return NextResponse.json({ ok: true, action, newBalance: r.balance });
    }

    // ban / unban / suspend / unsuspend → user_moderation upsert
    let patch: Record<string, unknown> = { user_id: id, updated_at: new Date().toISOString() };

    if (action === "ban") {
      patch = { ...patch, is_banned: true, ban_reason: body?.reason ?? null, banned_at: new Date().toISOString() };
    } else if (action === "unban") {
      patch = { ...patch, is_banned: false, ban_reason: null, banned_at: null };
    } else if (action === "suspend") {
      const days = Math.floor(Number(body?.days ?? 0));
      if (!Number.isFinite(days) || days <= 0) {
        return NextResponse.json({ ok: false, error: "유효한 정지 일수를 입력하세요." }, { status: 400 });
      }
      const until = new Date(Date.now() + days * 86400_000).toISOString();
      patch = { ...patch, suspended_until: until, suspend_reason: body?.reason ?? null };
    } else if (action === "unsuspend") {
      patch = { ...patch, suspended_until: null, suspend_reason: null };
    } else {
      return NextResponse.json({ ok: false, error: "알 수 없는 action입니다." }, { status: 400 });
    }

    const { error } = await svc
      .from("user_moderation")
      .upsert(patch, { onConflict: "user_id" });

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, action });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
