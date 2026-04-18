import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

export type DbNotification = {
  id: string;
  userId: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
};

function rowToNotification(row: Record<string, unknown>): DbNotification {
  return {
    id: String(row.id),
    userId: String(row.user_id),
    message: String(row.message ?? ""),
    link: typeof row.link === "string" ? row.link : null,
    isRead: Boolean(row.is_read),
    createdAt: typeof row.created_at === "string" ? row.created_at : new Date().toISOString(),
  };
}

// ─── GET: 내 알림 목록 ────────────────────────────────────────────────────────
export async function GET(_request: Request) {
  try {
    const auth = await createClient();
    const {
      data: { user },
    } = await auth.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      console.error("[notifications GET]", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const notifications = (Array.isArray(data) ? data : []).map((r) =>
      rowToNotification(r as Record<string, unknown>),
    );

    const unreadCount = notifications.filter((n) => !n.isRead).length;

    return NextResponse.json({ ok: true, notifications, unreadCount });
  } catch (e) {
    console.error("[notifications GET]", e);
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }
}

// ─── PATCH: 알림 읽음 처리 ────────────────────────────────────────────────────
export async function PATCH(request: Request) {
  try {
    const auth = await createClient();
    const {
      data: { user },
    } = await auth.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
    }

    const o = body as Record<string, unknown>;
    const supabase = createServiceRoleClient();

    // markAll: true → 전체 읽음
    if (o.markAll === true) {
      const { error } = await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", user.id)
        .eq("is_read", false);

      if (error) {
        console.error("[notifications PATCH markAll]", error);
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }
      return NextResponse.json({ ok: true });
    }

    // 특정 id 읽음
    const id = typeof o.id === "string" ? o.id : null;
    if (!id) {
      return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
    }

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) {
      console.error("[notifications PATCH]", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[notifications PATCH]", e);
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }
}

// ─── DELETE: 알림 삭제 ────────────────────────────────────────────────────────
export async function DELETE(request: Request) {
  try {
    const auth = await createClient();
    const {
      data: { user },
    } = await auth.auth.getUser();

    if (!user?.id) {
      return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
    }

    const url = new URL(request.url);
    const id = url.searchParams.get("id");
    const deleteAll = url.searchParams.get("all") === "true";

    const supabase = createServiceRoleClient();

    if (deleteAll) {
      const { error } = await supabase
        .from("notifications")
        .delete()
        .eq("user_id", user.id);
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    if (!id) {
      return NextResponse.json({ ok: false, error: "missing_id" }, { status: 400 });
    }

    const { error } = await supabase
      .from("notifications")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[notifications DELETE]", e);
    return NextResponse.json({ ok: false, error: "internal" }, { status: 500 });
  }
}
