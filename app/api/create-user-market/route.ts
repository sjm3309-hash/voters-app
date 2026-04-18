import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { ensureProfileRowExists } from "@/lib/ensure-profile";
import { isAdminEmail } from "@/lib/admin";
import { adjustPebblesAtomic } from "@/lib/pebbles-db";
import { CREATE_USER_MARKET_COST } from "@/lib/points-constants";
import {
  validateCreateUserMarketBody,
  type CreateUserMarketBodyIn,
} from "@/lib/create-user-market-validate";

const LOG = "[create-user-market]";

/**
 * 유저 생성 보트 API
 *
 * - 인증: 쿠키 기반 `getUser()` 로 본인 확인만 수행합니다.
 * - DB 쓰기: **항상 `createServiceRoleClient()` (SUPABASE_SERVICE_ROLE_KEY)** 로 수행하여
 *   클라이언트(anon) 권한·RLS에 막히지 않습니다. (서비스 롤은 Supabase에서 RLS를 우회합니다.)
 */
export async function POST(request: Request) {
  try {
    const supabaseAuth = await createClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    if (!user?.id) {
      console.error(LOG, "401 unauthorized — no session user");
      return NextResponse.json(
        { ok: false, error: "unauthorized", message: "로그인이 필요합니다." },
        { status: 401 },
      );
    }

    let rawJson: unknown;
    try {
      rawJson = await request.json();
    } catch (parseErr) {
      console.error(LOG, "invalid JSON body", parseErr);
      return NextResponse.json(
        { ok: false, error: "invalid_json", message: "요청 본문이 올바른 JSON이 아닙니다." },
        { status: 400 },
      );
    }

    const parsed = validateCreateUserMarketBody(
      (typeof rawJson === "object" && rawJson !== null ? rawJson : {}) as CreateUserMarketBodyIn,
    );
    if (!parsed.ok) {
      console.error(LOG, "validation failed", { userId: user.id, errors: parsed.errors });
      return NextResponse.json(
        {
          ok: false,
          error: "validation_failed",
          errors: parsed.errors,
          message: parsed.errors.map((e) => `${e.field}: ${e.message}`).join(" / "),
        },
        { status: 400 },
      );
    }

    const {
      question,
      dbCategory,
      subCategory,
      closingAtIso,
      accentColor,
      optionsForDb,
    } = parsed.data;

    const authorName =
      (user.user_metadata?.nickname as string | undefined)?.trim() ||
      (user.user_metadata?.full_name as string | undefined)?.trim() ||
      (user.user_metadata?.name as string | undefined)?.trim() ||
      user.email?.split("@")[0]?.trim() ||
      "익명";

    const externalId = `user_market:${user.id}:${Date.now()}:${Math.random().toString(16).slice(2, 10)}`;

    let supabase: ReturnType<typeof createServiceRoleClient>;
    try {
      supabase = createServiceRoleClient();
    } catch (envErr) {
      const msg = envErr instanceof Error ? envErr.message : String(envErr);
      console.error(LOG, "SERVICE_ROLE_CONFIG", msg);
      return NextResponse.json(
        { ok: false, error: msg, code: "SERVICE_ROLE_CONFIG", message: msg },
        { status: 503 },
      );
    }

    const profileOk = await ensureProfileRowExists(supabase, user.id);
    if (!profileOk.ok) {
      console.error(LOG, "profile ensure failed", profileOk.message);
      return NextResponse.json(
        {
          ok: false,
          error: profileOk.message,
          code: "PROFILE_ENSURE_FAILED",
          message:
            "프로필을 생성하지 못했습니다. Supabase에 profiles 테이블·마이그레이션을 확인해 주세요.",
        },
        { status: 500 },
      );
    }

    let chargedPebbles = false;
    const feeWaived = isAdminEmail(user.email);
    if (!feeWaived) {
      const spent = await adjustPebblesAtomic(user.id, -CREATE_USER_MARKET_COST);
      if (!spent.ok) {
        const insuff =
          spent.code === "insufficient_pebbles" ||
          String(spent.error ?? "").includes("insufficient_pebbles");
        console.error(LOG, "pebble deduct failed", spent);
        return NextResponse.json(
          {
            ok: false,
            error: insuff ? "insufficient_pebbles" : spent.error,
            message: insuff ? "페블이 부족합니다." : spent.error,
          },
          { status: insuff ? 400 : 500 },
        );
      }
      chargedPebbles = true;
    }

    /** JSONB: [{ label, color }, ...] — 홈·상세에서 옵션별 색상 반영 */
    const optionsPayload = optionsForDb;

    const row = {
      external_id: externalId,
      title: question.slice(0, 500),
      closing_at: closingAtIso,
      confirmed_at: null as string | null,
      user_id: user.id,
      category: dbCategory,
      sub_category: subCategory,
      league_id: null as string | null,
      status: "active" as const,
      color: accentColor,
      options: optionsPayload,
      is_admin_generated: false,
      author_name: authorName.slice(0, 120),
    };

    const { data, error } = await supabase.from("bets").insert(row).select("id").single();

    if (error || !data?.id) {
      if (chargedPebbles) {
        const refund = await adjustPebblesAtomic(user.id, CREATE_USER_MARKET_COST);
        console.error(LOG, "insert failed, refund attempted", { refundOk: refund.ok, insertError: error });
      } else {
        console.error(LOG, "insert failed", error);
      }
      const err = error as {
        message?: string;
        code?: string;
        details?: string;
        hint?: string;
      } | null;
      return NextResponse.json(
        {
          ok: false,
          error: err?.message ?? "insert_failed",
          code: err?.code,
          details: err?.details,
          hint: err?.hint,
          message: err?.message ?? "DB 저장에 실패했습니다.",
        },
        { status: 500 },
      );
    }

    console.info(LOG, "ok", { betId: data.id, userId: user.id });

    return NextResponse.json({
      ok: true,
      id: data.id as string,
    });
  } catch (e) {
    console.error(LOG, "unhandled exception", e);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { ok: false, error: msg, message: msg },
      { status: 500 },
    );
  }
}
