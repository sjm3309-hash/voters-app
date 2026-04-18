/**
 * 과거 버그로 선택지 색이 모두 동일(hexAccent 하나)하게 저장된
 * 「유저·운영자 직접 생성」보트만 골라 options[].color 와 bets.color 를 복구합니다.
 *
 * 제외: 동기화·자동 생성 보트 (external_id 가 user_market / custom_ 프리픽스가 아님)
 *
 * 사용:
 *   npx tsx scripts/migrate-manual-bet-option-colors.ts           # 드라이런 (DB 안 씀)
 *   APPLY=1 npx tsx scripts/migrate-manual-bet-option-colors.ts   # 실제 반영
 */

import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { fallbackHexByIndex } from "@/lib/option-colors";

const APPLY = process.env.APPLY === "1" || process.argv.includes("--apply");

type OptionRow = { label: string; color: string };

function isManualExternalId(externalId: string | null | undefined): boolean {
  if (!externalId) return false;
  return externalId.startsWith("user_market:") || externalId.startsWith("custom_");
}

function parseOptions(raw: unknown): OptionRow[] | null {
  if (!Array.isArray(raw) || raw.length < 2) return null;

  if (typeof raw[0] === "string") {
    const rows: OptionRow[] = [];
    for (let i = 0; i < raw.length; i++) {
      const label = String(raw[i]).trim();
      if (!label) return null;
      rows.push({ label, color: fallbackHexByIndex(i) });
    }
    return rows.length >= 2 ? rows : null;
  }

  const rows: OptionRow[] = [];
  for (let i = 0; i < raw.length; i++) {
    const x = raw[i];
    if (!x || typeof x !== "object" || !("label" in x)) continue;
    const label = String((x as { label?: unknown }).label ?? "").trim();
    if (!label) continue;
    const color = String((x as { color?: unknown }).color ?? "").trim();
    rows.push({ label, color });
  }
  return rows.length >= 2 ? rows : null;
}

function allColorsIdentical(opts: OptionRow[]): boolean {
  if (opts.length < 2) return false;
  const c0 = opts[0]!.color.trim().toLowerCase();
  return opts.every((o) => o.color.trim().toLowerCase() === c0);
}

/** 라벨만 있는 레거시(string[]) 또는 선택지 색이 전부 같은 경우 팔레트 부여 */
function rebuildColors(opts: OptionRow[]): OptionRow[] {
  return opts.map((o, i) => ({
    label: o.label,
    color: fallbackHexByIndex(i),
  }));
}

async function main() {
  console.log("[migrate-manual-bet-colors] APPLY=%s", APPLY ? "yes" : "no (dry-run)");

  let supabase: ReturnType<typeof createServiceRoleClient>;
  try {
    supabase = createServiceRoleClient();
  } catch (e) {
    console.error("SERVICE_ROLE:", e);
    process.exit(1);
    return;
  }

  const { data: rows, error } = await supabase
    .from("bets")
    .select("id, external_id, options, color")
    .limit(5000);

  if (error) {
    console.error("select failed:", error.message);
    process.exit(1);
    return;
  }

  const candidates = (rows ?? []).filter((r) =>
    isManualExternalId(r.external_id as string),
  );

  let wouldUpdate = 0;
  let skippedNoChange = 0;
  let skippedBadOptions = 0;

  for (const row of candidates) {
    const parsed = parseOptions(row.options);
    if (!parsed) {
      skippedBadOptions++;
      continue;
    }

    const stringOnlyLegacy =
      Array.isArray(row.options) && typeof (row.options as unknown[])[0] === "string";

    const needsFix = stringOnlyLegacy || allColorsIdentical(parsed);

    if (!needsFix) {
      skippedNoChange++;
      continue;
    }

    const nextOptions = rebuildColors(parsed);
    const accentColor = nextOptions[0]?.color ?? "#6366f1";

    wouldUpdate++;
    console.log(
      APPLY ? "UPDATE" : "would update",
      row.id,
      row.external_id,
      "options",
      parsed.map((o) => o.color).join("|"),
      "→",
      nextOptions.map((o) => o.color).join("|"),
    );

    if (APPLY) {
      const { error: upErr } = await supabase
        .from("bets")
        .update({
          options: nextOptions,
          color: accentColor,
        })
        .eq("id", row.id);

      if (upErr) {
        console.error("update failed id=", row.id, upErr.message);
      }
    }
  }

  console.log(
    "[migrate-manual-bet-colors] manual rows=%s, updated=%s, skipped_already_distinct=%s, skipped_bad_options=%s",
    candidates.length,
    wouldUpdate,
    skippedNoChange,
    skippedBadOptions,
  );

  if (!APPLY && wouldUpdate > 0) {
    console.log("Run with APPLY=1 or --apply to write changes.");
  }
}

void main();
