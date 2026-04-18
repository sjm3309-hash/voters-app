import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { collectSyncBetRows } from "@/lib/collect-sync-bet-rows";
import { isExternalBetSyncDisabled } from "@/lib/external-bet-sync";

const UPSERT_BATCH = 500;

async function runSyncAll() {
  if (isExternalBetSyncDisabled()) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason:
        "DISABLE_EXTERNAL_BET_SYNC — 외부 API 동기화가 비활성화되어 업서트하지 않았습니다.",
      counts: {
        collected: 0,
        upserted: 0,
        excluded: {
          pandascore_too_far: 0,
          pandascore_already_started: 0,
          football_too_far: 0,
          football_already_started: 0,
          total_sources: 0,
        },
      },
      savedTitles: [],
    });
  }

  const collected = await collectSyncBetRows(Date.now());
  if (!collected.ok) {
    return NextResponse.json(
      { ok: false, errors: collected.errors, stage: "collect" },
      { status: 400 },
    );
  }

  const supabase = createServiceRoleClient();
  const rows = collected.rows;

  let upserted = 0;
  const savedTitles: string[] = [];

  for (let i = 0; i < rows.length; i += UPSERT_BATCH) {
    const batch = rows.slice(i, i + UPSERT_BATCH);
    const { data, error } = await supabase
      .from("bets")
      .upsert(batch, { onConflict: "external_id" })
      .select("title");
    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code, stage: "upsert" },
        { status: 500 },
      );
    }
    upserted += batch.length;
    for (const r of (data ?? []) as { title: string }[]) {
      if (r?.title) savedTitles.push(r.title);
    }
  }

  return NextResponse.json({
    ok: true,
    counts: {
      collected: rows.length,
      upserted,
      excluded: collected.excluded,
    },
    savedTitles: savedTitles.slice(0, 50),
  });
}

export async function GET() {
  try {
    return await runSyncAll();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function POST() {
  try {
    return await runSyncAll();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

