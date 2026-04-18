import { NextResponse } from "next/server";
import { requireAdminJson } from "@/app/api/admin/_auth";
import { isAdminEmail } from "@/lib/admin";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

type Body = {
  userIds?: unknown;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const MAX_IDS = 2000;

export async function POST(request: Request) {
  const gate = await requireAdminJson();
  if (!gate.ok) return gate.response;

  try {
    const body = (await request.json().catch(() => null)) as Partial<Body> | null;
    const raw = body?.userIds;
    const list = Array.isArray(raw) ? raw : [];
    const validIds = [
      ...new Set(
        list
          .map((id) => String(id ?? "").trim())
          .filter((id) => id && id !== "anon" && UUID_RE.test(id)),
      ),
    ].slice(0, MAX_IDS);

    if (validIds.length === 0) {
      return NextResponse.json({
        ok: true,
        balances: {} as Record<string, number>,
        adminUserIds: [] as string[],
      });
    }

    const svc = createServiceRoleClient();
    const { data, error } = await svc.from("profiles").select("id, pebbles").in("id", validIds);

    if (error) {
      return NextResponse.json(
        { ok: false, error: error.message, code: error.code },
        { status: 500 },
      );
    }

    const balances: Record<string, number> = {};
    for (const row of (data ?? []) as { id?: string; pebbles?: number | null }[]) {
      const id = row.id;
      if (!id) continue;
      balances[id] = Math.max(0, Math.floor(Number(row.pebbles ?? 0)));
    }

    /** 로그인 UI와 동일: 운영자 이메일 계정은 고정 잔액 표시용 */
    const adminUserIds: string[] = [];
    const chunkSize = 20;
    for (let i = 0; i < validIds.length; i += chunkSize) {
      const chunk = validIds.slice(i, i + chunkSize);
      const parts = await Promise.all(
        chunk.map(async (id) => {
          try {
            const { data: udata, error: uerr } = await svc.auth.admin.getUserById(id);
            if (uerr || !udata?.user?.email) return null;
            return isAdminEmail(udata.user.email) ? id : null;
          } catch {
            return null;
          }
        }),
      );
      for (const id of parts) {
        if (id) adminUserIds.push(id);
      }
    }

    return NextResponse.json({ ok: true, balances, adminUserIds });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
