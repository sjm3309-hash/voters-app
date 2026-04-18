import { NextResponse } from "next/server";
import { requireAdminJson } from "@/app/api/admin/_auth";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import type { CustomerCenterPostRow, InquiryStatus } from "@/lib/customer-center";

// ─── GET: 전체 문의·제안 목록 ─────────────────────────────────────────────────
export async function GET(request: Request) {
  const auth = await requireAdminJson();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const category = url.searchParams.get("category"); // "inquiry" | "proposal" | null(전체)
  const status = url.searchParams.get("status");     // "pending" | "answered" | "closed" | null
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1"));
  const pageSize = 30;

  const supabase = createServiceRoleClient();
  let q = supabase
    .from("customer_center_posts")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (category) q = q.eq("category", category);
  if (status) q = q.eq("status", status);

  const { data, error, count } = await q;
  if (error) {
    console.error("[admin/customer-center GET]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    posts: (data ?? []) as CustomerCenterPostRow[],
    total: count ?? 0,
    page,
    pageSize,
  });
}

// ─── PATCH: 운영자 답변 / 상태 변경 ──────────────────────────────────────────
export async function PATCH(request: Request) {
  const auth = await requireAdminJson();
  if (!auth.ok) return auth.response;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const o = body as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : null;
  if (!id) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (typeof o.admin_reply === "string") {
    updates.admin_reply = o.admin_reply.trim() || null;
    updates.admin_replied_at = o.admin_reply.trim() ? new Date().toISOString() : null;
    // 답변이 있으면 자동으로 answered 처리
    if (o.admin_reply.trim()) {
      updates.status = "answered";
    }
  }

  if (typeof o.status === "string" && ["pending", "answered", "closed"].includes(o.status)) {
    updates.status = o.status as InquiryStatus;
  }

  const supabase = createServiceRoleClient();
  const { data, error } = await supabase
    .from("customer_center_posts")
    .update(updates)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    console.error("[admin/customer-center PATCH]", error);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, post: data as CustomerCenterPostRow });
}

// ─── DELETE: 게시물 삭제 ─────────────────────────────────────────────────────
export async function DELETE(request: Request) {
  const auth = await requireAdminJson();
  if (!auth.ok) return auth.response;

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
  }

  const supabase = createServiceRoleClient();
  const { error } = await supabase.from("customer_center_posts").delete().eq("id", id);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
