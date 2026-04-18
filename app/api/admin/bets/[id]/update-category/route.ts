import { NextResponse } from "next/server";
import { requireAdminJson } from "@/app/api/admin/_auth";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import { marketCategoryIdToDbLabel, isPublicMarketCategoryId } from "@/lib/market-category-db";
import { subCategoryIdToDbLabel } from "@/lib/subcategories";

/**
 * POST /api/admin/bets/[id]/update-category
 * 보트의 카테고리와 세부 카테고리를 변경합니다.
 */
export async function POST(
  req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdminJson();
  if (!auth.ok) return auth.response;

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ ok: false, error: "missing id" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const categoryId = String((body as Record<string, unknown>).categoryId ?? "").trim();
  const subCategoryId = String((body as Record<string, unknown>).subCategoryId ?? "").trim();

  if (!isPublicMarketCategoryId(categoryId)) {
    return NextResponse.json({ ok: false, error: "허용되지 않는 카테고리입니다." }, { status: 400 });
  }

  const dbCategory = marketCategoryIdToDbLabel(categoryId);
  const dbSubCategory = subCategoryId
    ? subCategoryIdToDbLabel(categoryId, subCategoryId)
    : "기타";

  try {
    const svc = createServiceRoleClient();

    const { error: checkErr, data: bet } = await svc
      .from("bets")
      .select("id")
      .eq("id", id)
      .maybeSingle();

    if (checkErr) return NextResponse.json({ ok: false, error: checkErr.message }, { status: 500 });
    if (!bet) return NextResponse.json({ ok: false, error: "보트를 찾을 수 없습니다." }, { status: 404 });

    const { error: updateErr } = await svc
      .from("bets")
      .update({ category: dbCategory, sub_category: dbSubCategory })
      .eq("id", id);

    if (updateErr) return NextResponse.json({ ok: false, error: updateErr.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      message: `카테고리가 변경되었습니다: ${dbCategory} / ${dbSubCategory}`,
      category: dbCategory,
      subCategory: dbSubCategory,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
