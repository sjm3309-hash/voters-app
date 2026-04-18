import { NextResponse } from "next/server";

/**
 * 외부 API(PandaScore, API-Football 등)로 자동 보트를 만드는 동기화를 끕니다.
 * `.env` / `.env.local` 예: `DISABLE_EXTERNAL_BET_SYNC=true`
 * (수동 `create-custom-bet`·유저 생성 보트 API는 막지 않습니다.)
 */
export function isExternalBetSyncDisabled(): boolean {
  const v = process.env.DISABLE_EXTERNAL_BET_SYNC?.trim().toLowerCase();
  return v === "true" || v === "1" || v === "yes";
}

/** 크론/스크립트가 실패·재시도 루프에 안 빠지도록 200 + skipped */
export function externalBetSyncSkippedResponse(): NextResponse {
  return NextResponse.json(
    {
      ok: true,
      success: true,
      skipped: true,
      reason:
        "외부 API 자동 보트 동기화가 꺼져 있습니다. (.env: DISABLE_EXTERNAL_BET_SYNC=true)",
    },
    { status: 200 },
  );
}
