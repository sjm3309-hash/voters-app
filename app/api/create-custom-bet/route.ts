import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { officialSyncedBetColumns, validateAdminUserId } from "@/lib/admin-sync-bets";
import { requireAdminJson } from "@/app/api/admin/_auth";
import { OPTION_FALLBACK_HEX, normalizeHex6 } from "@/lib/option-colors";

type CreateCustomBetBody = {
  title: string;
  category: "스포츠" | "게임";
  subCategory: string;
  beginAt: string; // ISO
  color: string; // hex
  /** 2~5개 — `{ label, color }[]` 권장. 생략 시 subCategory 기본 라벨 + 팔레트 색 */
  options?: string[] | Array<{ label: string; color: string }>;
};

function isHexColor(v: unknown): v is string {
  if (typeof v !== "string") return false;
  const s = v.trim();
  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(s);
}

function parseISOToMs(v: string): number {
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

function pickDefaultOptionObjects(subCategory: string): { label: string; color: string }[] {
  const labels =
    subCategory.trim() === "해외축구" ? ["승", "무", "패"] : ["승", "패"];
  return labels.map((label, i) => ({
    label,
    color: OPTION_FALLBACK_HEX[i % OPTION_FALLBACK_HEX.length]!,
  }));
}

function normalizeAdminOptionsPayload(raw: unknown):
  | { ok: true; rows: { label: string; color: string }[] }
  | { ok: false; message: string } {
  if (!Array.isArray(raw)) return { ok: false, message: "options must be an array" };
  if (raw.length < 2 || raw.length > 5) {
    return { ok: false, message: "options must contain between 2 and 5 entries" };
  }

  if (raw.every((x) => typeof x === "string")) {
    const labels = (raw as string[]).map((s) => String(s).trim()).filter(Boolean);
    if (labels.length !== raw.length) {
      return { ok: false, message: "options must not contain empty strings" };
    }
    if (labels.length < 2 || labels.length > 5) {
      return { ok: false, message: "options must contain between 2 and 5 entries" };
    }
    if (new Set(labels).size !== labels.length) {
      return { ok: false, message: "duplicate option labels" };
    }
    const rows = labels.map((label, i) => ({
      label: label.slice(0, 500),
      color: OPTION_FALLBACK_HEX[i % OPTION_FALLBACK_HEX.length]!,
    }));
    return { ok: true, rows };
  }

  const rows: { label: string; color: string }[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") return { ok: false, message: "invalid option entry" };
    const label = String((x as { label?: unknown }).label ?? "").trim().slice(0, 500);
    const colorRaw = String((x as { color?: unknown }).color ?? "").trim();
    const color = normalizeHex6(colorRaw);
    if (!label) return { ok: false, message: "each option needs a label" };
    if (!color) return { ok: false, message: `유효한 hex 색(#RRGGBB)이 필요합니다: "${label}"` };
    rows.push({ label, color });
  }
  if (new Set(rows.map((r) => r.label)).size !== rows.length) {
    return { ok: false, message: "duplicate option labels" };
  }
  return { ok: true, rows };
}

async function requireAdmin(request: Request): Promise<NextResponse | null> {
  const secret = request.headers.get("x-admin-secret")?.trim();
  const envSecret = process.env.ADMIN_SECRET?.trim();
  if (envSecret && secret && secret === envSecret) return null;

  // 헤더 시크릿이 없거나 불일치하면 운영자 세션 기반으로 재검증
  const admin = await requireAdminJson();
  if (!admin.ok) return admin.response;
  return null;
}

export async function POST(request: Request) {
  try {
    const forbidden = await requireAdmin(request);
    if (forbidden) return forbidden;

    const admin = validateAdminUserId();
    if (!admin.ok) {
      return NextResponse.json(
        { ok: false, errors: admin.errors },
        { status: 400 },
      );
    }

    const body = (await request.json().catch(() => null)) as Partial<CreateCustomBetBody> | null;
    if (!body) {
      return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
    }

    const title = String(body.title ?? "").trim();
    const category = body.category;
    const subCategory = String(body.subCategory ?? "").trim();
    const beginAt = String(body.beginAt ?? "").trim();
    const color = String(body.color ?? "").trim();
    const hasExplicitOptions = body.options !== undefined && body.options !== null;

    const errors: string[] = [];
    if (!title) errors.push("title is required");
    if (category !== "스포츠" && category !== "게임") errors.push("category must be '스포츠' or '게임'");
    if (!subCategory) errors.push("subCategory is required");
    if (!beginAt || !Number.isFinite(parseISOToMs(beginAt))) errors.push("beginAt must be a valid ISO datetime string");
    if (!isHexColor(color)) errors.push("color must be a hex string like #RRGGBB");

    let optionsPayload: { label: string; color: string }[] =
      pickDefaultOptionObjects(subCategory);
    if (hasExplicitOptions) {
      const norm = normalizeAdminOptionsPayload(body.options);
      if (!norm.ok) {
        errors.push(norm.message);
      } else {
        optionsPayload = norm.rows;
      }
    }

    if (errors.length > 0) {
      return NextResponse.json({ ok: false, errors }, { status: 400 });
    }

    const kickoffMs = parseISOToMs(beginAt);
    /** 실제 결과 확정 시각은 정산 시점에 따로 두고, 생성 시에는 null 유지.
     * `/api/bets-feed`가 `confirmed_at`이 오래된 행은 제외하므로, 과거 시작 시각+3시간을
     * 넣으면 연습 보트가 며칠 뒤 피드에서 사라지는 현상이 난다. */
    const confirmedAt: string | null = null;
    const externalId = `custom_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;

    const supabase = createServiceRoleClient();
    const officialCols = officialSyncedBetColumns();

    const row = {
      external_id: externalId,
      title,
      closing_at: new Date(kickoffMs).toISOString(),
      confirmed_at: confirmedAt,
      user_id: admin.adminUserId,
      category,
      sub_category: subCategory,
      league_id: null,
      status: "active" as const,
      color,
      options: optionsPayload,
      ...officialCols,
    };

    const { data, error } = await supabase
      .from("bets")
      .upsert(row, { onConflict: "external_id" })
      .select("id, external_id, title, closing_at, confirmed_at, category, sub_category, color, author_name, is_admin_generated")
      .single();

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code },
        { status: 500 },
      );
    }

    return NextResponse.json({ ok: true, bet: data });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

