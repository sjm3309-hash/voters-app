import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { isAdminEmail } from "@/lib/admin";
import { isUuidString } from "@/lib/is-uuid";
import { optionIdsForLabels, resolveBetOptionLabels } from "@/lib/bets-market-mapper";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store, max-age=0" as const };

type Body = { winningOptionId?: string };

/**
 * 창작자(bets.user_id) 또는 운영자만 — UUID 보트 정산을 DB에 반영합니다.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await context.params;
  const marketId = rawId?.trim() ?? "";
  if (!marketId || !isUuidString(marketId)) {
    return NextResponse.json({ ok: false, error: "invalid_id" }, { status: 400, headers: NO_STORE });
  }

  const body = (await request.json().catch(() => null)) as Partial<Body> | null;
  const winningOptionId = String(body?.winningOptionId ?? "").trim();
  if (!winningOptionId) {
    return NextResponse.json({ ok: false, error: "missing winningOptionId" }, { status: 400, headers: NO_STORE });
  }

  const auth = await createClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401, headers: NO_STORE });
  }

  let svc: ReturnType<typeof createServiceRoleClient>;
  try {
    svc = createServiceRoleClient();
  } catch (envErr) {
    const msg = envErr instanceof Error ? envErr.message : String(envErr);
    return NextResponse.json({ ok: false, error: msg, code: "SERVICE_ROLE_CONFIG" }, { status: 503, headers: NO_STORE });
  }

  const { data: row, error: selErr } = await svc
    .from("bets")
    .select("id, user_id, status, title, options, closing_at")
    .eq("id", marketId)
    .maybeSingle();

  if (selErr) {
    return NextResponse.json(
      { ok: false, error: selErr.message, code: selErr.code },
      { status: 500, headers: NO_STORE },
    );
  }
  if (!row) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404, headers: NO_STORE });
  }

  const r = row as {
    id: string;
    user_id?: string | null;
    status?: string | null;
    closing_at?: string | null;
  };
  const admin = isAdminEmail(user.email);
  const creator = r.user_id != null && String(r.user_id) === user.id;
  if (!admin && !creator) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403, headers: NO_STORE });
  }

  const status = (r.status ?? "").toLowerCase();
  if (["settled", "resolved", "completed", "cancelled", "void"].includes(status)) {
    return NextResponse.json({ ok: false, error: "already_finalized" }, { status: 409, headers: NO_STORE });
  }

  // 창작자는 베팅 마감 시간(closing_at) 이전에 정산 불가 (운영자는 시간 제한 없음)
  if (!admin && r.closing_at) {
    const closingAtMs = new Date(r.closing_at).getTime();
    if (Number.isFinite(closingAtMs) && Date.now() < closingAtMs) {
      return NextResponse.json(
        {
          ok: false,
          error: "too_early",
          message: `베팅 마감 시간(${new Date(r.closing_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })} KST) 이후에 결과를 입력할 수 있습니다.`,
        },
        { status: 403, headers: NO_STORE },
      );
    }
  }

  const labels = resolveBetOptionLabels({
    title: String((row as { title?: string | null }).title ?? ""),
    options: (row as { options?: unknown }).options,
  });
  const allowed = new Set(optionIdsForLabels(marketId, labels));
  if (!allowed.has(winningOptionId)) {
    return NextResponse.json(
      { ok: false, error: "invalid_winning_option", message: "선택지 ID가 이 보트의 옵션과 일치하지 않습니다." },
      { status: 400, headers: NO_STORE },
    );
  }

  const confirmedAt = new Date().toISOString();
  const { error: upErr } = await svc
    .from("bets")
    .update({
      status: "settled",
      winning_option_id: winningOptionId,
      confirmed_at: confirmedAt,
    })
    .eq("id", marketId);

  if (upErr) {
    return NextResponse.json(
      { ok: false, error: upErr.message, code: upErr.code, details: upErr },
      { status: 500, headers: NO_STORE },
    );
  }

  return NextResponse.json({ ok: true, confirmedAt, winningOptionId }, { headers: NO_STORE });
}
