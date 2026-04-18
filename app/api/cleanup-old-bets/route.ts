import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

const LOG = "[cleanup-old-bets]";
const DELETE_AFTER_DAYS = 30;

function requireCronAuth(request: Request): NextResponse | null {
  if (process.env.NODE_ENV === "development") return null;

  const expected = process.env.CRON_SECRET?.trim();
  const provided = request.headers.get("authorization")?.trim();

  if (!expected) {
    return NextResponse.json(
      { success: false, error: "Missing CRON_SECRET env" },
      { status: 500 },
    );
  }
  if (!provided || provided !== expected) {
    return NextResponse.json(
      { success: false, error: "Unauthorized" },
      { status: 401 },
    );
  }
  return null;
}

async function runCleanup() {
  const supabase = createServiceRoleClient();

  // confirmed_at 이 30일 이상 지난 settled 보트 조회
  const cutoff = new Date(Date.now() - DELETE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();

  console.log(LOG, "cutoff", cutoff);

  // 삭제 대상 보트 ID 목록 먼저 조회
  const { data: targets, error: queryErr } = await supabase
    .from("bets")
    .select("id, title, confirmed_at")
    .eq("status", "settled")
    .lt("confirmed_at", cutoff);

  if (queryErr) {
    console.error(LOG, "query error", queryErr.message);
    return NextResponse.json({ success: false, error: queryErr.message }, { status: 500 });
  }

  if (!targets || targets.length === 0) {
    console.log(LOG, "no targets");
    return NextResponse.json({ success: true, deleted: 0 });
  }

  const ids = targets.map((b) => b.id);
  console.log(LOG, `deleting ${ids.length} bets`, targets.map((b) => b.title));

  // 연관 데이터 삭제 (cascade가 없는 경우 대비)
  await supabase.from("bet_history").delete().in("bet_id", ids);
  await supabase.from("boat_comments").delete().in("bet_id", ids);

  // 보트 삭제
  const { error: deleteErr, count } = await supabase
    .from("bets")
    .delete({ count: "exact" })
    .in("id", ids);

  if (deleteErr) {
    console.error(LOG, "delete error", deleteErr.message);
    return NextResponse.json({ success: false, error: deleteErr.message }, { status: 500 });
  }

  console.log(LOG, "done", { deleted: count });
  return NextResponse.json({
    success: true,
    deleted: count ?? ids.length,
    titles: targets.map((b) => b.title),
  });
}

export async function GET(request: Request) {
  const authErr = requireCronAuth(request);
  if (authErr) return authErr;

  try {
    return await runCleanup();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(LOG, "fatal", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const authErr = requireCronAuth(request);
  if (authErr) return authErr;

  try {
    return await runCleanup();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(LOG, "fatal", msg);
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
