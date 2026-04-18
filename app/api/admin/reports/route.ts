import { NextResponse } from "next/server";
import { requireAdminJson } from "@/app/api/admin/_auth";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

// ─── GET: 신고 목록 ───────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const auth = await requireAdminJson();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const status     = url.searchParams.get("status");
  const targetType = url.searchParams.get("targetType");
  const page       = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const pageSize   = 30;

  const supabase = createServiceRoleClient();
  let q = supabase
    .from("reports")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (status) q = q.eq("status", status);
  if (targetType) q = q.eq("target_type", targetType);

  const { data, error, count } = await q;
  if (error) {
    console.error("[admin/reports GET]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, reports: data ?? [], total: count ?? 0, page, pageSize });
}

// ─── PATCH: 신고 상태 변경 / 운영자 메모 ─────────────────────────────────────
export async function PATCH(request: Request) {
  const auth = await requireAdminJson();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const o = body as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : null;
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (typeof o.status === "string" && ["pending", "reviewed", "dismissed"].includes(o.status)) {
    updates.status = o.status;
  }
  if (typeof o.admin_note === "string") updates.admin_note = o.admin_note.trim() || null;

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("reports")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, report: data });
}

// ─── DELETE: 신고 삭제 ────────────────────────────────────────────────────────
export async function DELETE(request: Request) {
  const auth = await requireAdminJson();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("reports").delete().eq("id", id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
