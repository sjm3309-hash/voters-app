import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { officialSyncedBetColumns, validateAdminUserId } from "@/lib/admin-sync-bets";
import { requireAdminJson } from "@/app/api/admin/_auth";

type CreateCustomBetBody = {
  title: string;
  category: "스포츠" | "게임";
  subCategory: string;
  beginAt: string; // ISO
  color: string; // hex
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

function pickOptions(subCategory: string): string[] {
  // 기존 동기화 로직과 동일한 의도를 유지: 해외축구는 3지선다, 그 외는 2지선다
  return subCategory.trim() === "해외축구" ? ["승", "무", "패"] : ["승", "패"];
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

    const errors: string[] = [];
    if (!title) errors.push("title is required");
    if (category !== "스포츠" && category !== "게임") errors.push("category must be '스포츠' or '게임'");
    if (!subCategory) errors.push("subCategory is required");
    if (!beginAt || !Number.isFinite(parseISOToMs(beginAt))) errors.push("beginAt must be a valid ISO datetime string");
    if (!isHexColor(color)) errors.push("color must be a hex string like #RRGGBB");
    if (errors.length > 0) {
      return NextResponse.json({ ok: false, errors }, { status: 400 });
    }

    const kickoffMs = parseISOToMs(beginAt);
    const confirmedAt = new Date(kickoffMs + 3 * 60 * 60 * 1000).toISOString();
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
      options: pickOptions(subCategory),
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

