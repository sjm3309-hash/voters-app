import type { BetRowPublic } from "@/lib/bets-market-mapper";
import mockJson from "@/data/mock-prediction-markets.json";

/** 로컬에서 외부 API(PandaScore, API-Football 등) 없이 테스트할 때 `.env.local`에 설정 */
export function useMockPredictionData(): boolean {
  return process.env.USE_MOCK_PREDICTION_DATA === "true";
}

/** collect-sync 등에서 `SyncBetRowInsert[]`로 단언해 사용 (순환 import 방지를 위해 여기서는 원본만 반환) */
export function getMockSyncBetRowsRaw(): typeof mockJson.syncBetRows {
  return mockJson.syncBetRows;
}

export function getMockBetFeedRows(): BetRowPublic[] {
  return mockJson.betFeedRows as BetRowPublic[];
}

export function getMockPandascoreTestSample(): {
  id: number;
  name: string | null;
  begin_at: string | null;
}[] {
  return mockJson.testPandascoreSample;
}
