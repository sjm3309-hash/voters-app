import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { isAdminEmail } from "@/lib/admin";
import { ADMIN_BALANCE } from "@/lib/points-constants";
import { bootstrapProfileBalance, readProfilePebblesFromDb } from "@/lib/pebbles-db";

function extractNickname(user: { email?: string | null; user_metadata?: Record<string, unknown> | null }): string | null {
  const m = user.user_metadata ?? {};
  const raw =
    (typeof m.nickname === "string" && m.nickname) ||
    (typeof m.full_name === "string" && m.full_name) ||
    (typeof m.name === "string" && m.name) ||
    user.email?.split("@")[0] ||
    null;
  return raw ? String(raw).trim() || null : null;
}

/**
 * 단일 소스: public.profiles.pebbles
 * 프로필 행 없음 → bootstrap RPC로 행 생성 + 환영 보너스 1회 적용 후 잔액 반환.
 * profiles.nickname 이 비어 있으면 auth metadata 에서 동기화합니다.
 */
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    if (isAdminEmail(user.email)) {
      return NextResponse.json({ ok: true, pebbles: ADMIN_BALANCE, admin: true });
    }

    const read = await readProfilePebblesFromDb(user.id);
    if (!read.ok) {
      return NextResponse.json({ ok: false, error: read.error }, { status: 500 });
    }

    // 닉네임 싱크 (nickname 컬럼이 비어 있는 경우에만 write)
    const nickname = extractNickname(user as Parameters<typeof extractNickname>[0]);
    if (nickname && read.exists) {
      const svc = createServiceRoleClient();
      const { data: prof } = await svc
        .from("profiles")
        .select("nickname")
        .eq("id", user.id)
        .maybeSingle();
      if (prof && !(prof as { nickname?: string | null }).nickname) {
        void svc.from("profiles").update({ nickname }).eq("id", user.id);
      }
    }

    if (read.exists) {
      return NextResponse.json({ ok: true, pebbles: read.pebbles, admin: false });
    }

    const boot = await bootstrapProfileBalance(user.id);
    if (!boot.ok) {
      return NextResponse.json({ ok: false, error: boot.error }, { status: 500 });
    }

    // 신규 프로필 생성 직후 닉네임 저장
    if (nickname) {
      const svc = createServiceRoleClient();
      void svc.from("profiles").update({ nickname }).eq("id", user.id);
    }

    return NextResponse.json({ ok: true, pebbles: boot.balance, admin: false });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
