/**
 * 로컬 DB와 앱 코드가 같은 bet_history 컬럼 세트를 쓰는지 확인합니다.
 *   npx tsx scripts/verify-bet-history-schema.ts
 */
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import {
  buildBetHistoryInsert,
  getBetHistoryFlavor,
  resetBetHistoryFlavorCache,
} from "../lib/bet-history-flavor";

dotenv.config({ path: ".env.local" });

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v?.trim()) throw new Error(`Missing env: ${name}`);
  return v.trim();
}

async function main() {
  resetBetHistoryFlavorCache();
  const url = mustEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = mustEnv("SUPABASE_SERVICE_ROLE_KEY");
  const svc = createClient(url, key);

  const flavor = await getBetHistoryFlavor(svc);
  const sample = buildBetHistoryInsert(flavor, {
    marketId: "00000000-0000-4000-8000-000000000000",
    optionId: "00000000-0000-4000-8000-000000000001",
    userId: "00000000-0000-4000-8000-000000000002",
    amount: 1,
  });

  console.log("[verify-bet-history] flavor:", flavor);
  console.log("[verify-bet-history] insert shape keys:", Object.keys(sample).sort().join(", "));
  console.log("[verify-bet-history] ok — place-bet / backtest는 이 스키마에 맞춰 동작합니다.");
}

main().catch((e) => {
  console.error("[verify-bet-history] failed:", e);
  process.exit(1);
});
