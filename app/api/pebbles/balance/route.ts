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
 * - 1순위: 인증된 유저 자신의 클라이언트로 profiles 조회 (서비스롤 키 불필요)
 * - 2순위: 서비스롤 클라이언트 폴백 (Vercel 환경변수에 SUPABASE_SERVICE_ROLE_KEY 필요)
 * - 프로필 없음 → bootstrap RPC로 행 생성 + 환영 보너스 1회 적용
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

    // ── 1순위: 인증 유저 클라이언트로 직접 조회 (RLS SELECT 정책 필요, 서비스롤 불필요) ──
    const { data: directProfile, error: directError } = await supabase
      .from("profiles")
      .select("pebbles, nickname")
      .eq("id", user.id)
      .maybeSingle();

    if (!directError && directProfile !== null) {
      const pebbles = Math.max(
        0,
        Math.floor(Number((directProfile as { pebbles?: unknown }).pebbles ?? 0)),
      );

      // 닉네임 싱크 (비어있는 경우 백그라운드 업데이트)
      const nickname = extractNickname(user as Parameters<typeof extractNickname>[0]);
      const storedNickname = (directProfile as { nickname?: string | null }).nickname;
      if (nickname && !storedNickname) {
        try {
          const svc = createServiceRoleClient();
          void svc.from("profiles").update({ nickname }).eq("id", user.id);
        } catch { /* 서비스롤 없어도 무시 */ }
      }

      return NextResponse.json({ ok: true, pebbles, admin: false });
    }

    // ── 2순위: 서비스롤 폴백 (직접 조회 실패 시) ──
    const read = await readProfilePebblesFromDb(user.id);
    if (!read.ok) {
      return NextResponse.json({ ok: false, error: read.error }, { status: 500 });
    }

    const nickname = extractNickname(user as Parameters<typeof extractNickname>[0]);

    if (read.exists) {
      if (nickname) {
        try {
          const svc = createServiceRoleClient();
          const { data: prof } = await svc
            .from("profiles")
            .select("nickname")
            .eq("id", user.id)
            .maybeSingle();
          if (prof && !(prof as { nickname?: string | null }).nickname) {
            void svc.from("profiles").update({ nickname }).eq("id", user.id);
          }
        } catch { /* 무시 */ }
      }
      return NextResponse.json({ ok: true, pebbles: read.pebbles, admin: false });
    }

    // 프로필 행 없음 → bootstrap
    const boot = await bootstrapProfileBalance(user.id);
    if (!boot.ok) {
      return NextResponse.json({ ok: false, error: boot.error }, { status: 500 });
    }

    if (nickname) {
      try {
        const svc = createServiceRoleClient();
        void svc.from("profiles").update({ nickname }).eq("id", user.id);
      } catch { /* 무시 */ }
    }

    return NextResponse.json({ ok: true, pebbles: boot.balance, admin: false });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
