import { isPublicMarketCategoryId, marketCategoryIdToDbLabel } from "@/lib/market-category-db";
import { fallbackHexByIndex, parseStoredOptionColor } from "@/lib/option-colors";

export type CreateUserMarketFieldError = {
  field: string;
  code: string;
  message: string;
};

export type CreateUserMarketBodyIn = {
  question?: string;
  category?: string;
  subCategory?: string;
  endsAt?: string;
  resultAt?: string;
  options?: { label?: string; color?: string }[];
};

function parseIsoMs(v: string): number {
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

/** PostgreSQL `timestamptz` / Supabase에 넣기 적합한 UTC ISO 문자열 */
export function toTimestamptzIso(input: string, field: string): { ok: true; iso: string } | { ok: false; code: string } {
  const s = String(input ?? "").trim();
  if (!s) return { ok: false, code: `${field}_empty` };
  const ms = new Date(s).getTime();
  if (!Number.isFinite(ms)) return { ok: false, code: `${field}_invalid_date` };
  return { ok: true, iso: new Date(ms).toISOString() };
}

export type NormalizedOptionRow = { label: string; colorHint: string };

/** `bets.options` — DB에는 라벨 문자열 배열(JSON/JSONB). 색은 표시용으로만 검증 */
export function normalizeOptionsForDb(raw: unknown): { ok: true; rows: NormalizedOptionRow[] } | { ok: false; code: string } {
  if (!Array.isArray(raw)) return { ok: false, code: "options_not_array" };
  const rows: NormalizedOptionRow[] = [];
  for (const o of raw) {
    const label =
      typeof o === "object" && o !== null ? String((o as { label?: unknown }).label ?? "").trim() : "";
    if (!label) continue;
    const colorHint =
      typeof o === "object" && o !== null ? String((o as { color?: unknown }).color ?? "").trim() : "";
    rows.push({
      label: label.slice(0, 500),
      colorHint: colorHint.slice(0, 120),
    });
  }
  if (rows.length < 2 || rows.length > 5) return { ok: false, code: "options_count" };
  const labels = rows.map((r) => r.label);
  if (new Set(labels).size !== labels.length) return { ok: false, code: "options_duplicate_labels" };
  const visual = rows.map((r) => r.colorHint || "__default__");
  if (new Set(visual).size !== visual.length) return { ok: false, code: "options_duplicate_colors" };
  return { ok: true, rows };
}

export function validateCreateUserMarketBody(body: CreateUserMarketBodyIn): {
  ok: true;
  data: {
    question: string;
    categoryId: string;
    dbCategory: string;
    subCategory: string;
    closingAtIso: string;
    resultAtIso: string;
    optionLabels: string[];
    /** DB `bets.options` JSONB — 라벨 + 색(hex / oklch 등 CSS 문자열) */
    optionsForDb: { label: string; color: string }[];
    /** DB `bets.color` — 카드 강조용(첫 선택지 색) */
    accentColor: string;
  };
} | { ok: false; errors: CreateUserMarketFieldError[] } {
  const errors: CreateUserMarketFieldError[] = [];

  const question = String(body.question ?? "").trim();
  if (question.length < 5) {
    errors.push({ field: "question", code: "too_short", message: "질문은 5자 이상이어야 합니다." });
  }

  const category = String(body.category ?? "").trim();
  if (!isPublicMarketCategoryId(category)) {
    errors.push({ field: "category", code: "invalid", message: "허용되지 않는 카테고리입니다." });
  }

  const endsNorm = toTimestamptzIso(String(body.endsAt ?? ""), "endsAt");
  if (!endsNorm.ok) {
    errors.push({
      field: "endsAt",
      code: endsNorm.code,
      message: "마감 일시(endsAt)가 올바른 날짜·시간 형식이 아닙니다. ISO 8601 형식으로 보내 주세요.",
    });
  }

  const resNorm = toTimestamptzIso(String(body.resultAt ?? ""), "resultAt");
  if (!resNorm.ok) {
    errors.push({
      field: "resultAt",
      code: resNorm.code,
      message: "결과 발표 일시(resultAt)가 올바른 날짜·시간 형식이 아닙니다.",
    });
  }

  const optNorm = normalizeOptionsForDb(body.options);
  if (!optNorm.ok) {
    const msg =
      optNorm.code === "options_count"
        ? "선택지는 2개 이상 5개 이하여야 합니다."
        : optNorm.code === "options_duplicate_labels"
          ? "선택지 이름이 중복되었습니다."
          : optNorm.code === "options_duplicate_colors"
            ? "선택지 색상이 서로 달라야 합니다."
            : "options는 배열이어야 하며 각 항목에 label이 필요합니다.";
    errors.push({ field: "options", code: optNorm.code, message: msg });
  }

  if (errors.length > 0) return { ok: false, errors };

  const endsOk = endsNorm as { ok: true; iso: string };
  const resOk = resNorm as { ok: true; iso: string };
  const optOk = optNorm as { ok: true; rows: NormalizedOptionRow[] };

  const endMs = parseIsoMs(endsOk.iso);
  const resMs = parseIsoMs(resOk.iso);
  const ENDS_GRACE_MS = 5 * 60 * 1000;
  if (endMs < Date.now() - ENDS_GRACE_MS) {
    errors.push({
      field: "endsAt",
      code: "must_be_future",
      message: "마감 일시는 현재 시각 이후여야 합니다. 확인 창을 오래 연 경우 일시를 다시 선택해 주세요.",
    });
  }
  if (resMs <= endMs) {
    errors.push({
      field: "resultAt",
      code: "after_close",
      message: "결과 발표 일시는 마감 일시보다 이후여야 합니다.",
    });
  }

  if (errors.length > 0) return { ok: false, errors };

  /** 폼에서 넘긴 색(oklch·hex 등)을 그대로 유지 — 예전처럼 hex만 인정하면 전부 같은 accent로 덮어씌워짐 */
  const optionsForDb = optOk.rows.map((r, i) => {
    const parsed = parseStoredOptionColor(r.colorHint);
    return {
      label: r.label,
      color: parsed ?? fallbackHexByIndex(i),
    };
  });

  const accentColor = optionsForDb[0]?.color ?? "#6366f1";

  // subCategory: 빈 문자열이면 "기타"로 처리
  const subCategory = String(body.subCategory ?? "").trim() || "기타";

  return {
    ok: true,
    data: {
      question,
      categoryId: category,
      dbCategory: marketCategoryIdToDbLabel(category),
      subCategory,
      closingAtIso: endsOk.iso,
      resultAtIso: resOk.iso,
      optionLabels: optOk.rows.map((r) => r.label),
      accentColor,
      optionsForDb,
    },
  };
}
