import { NextResponse } from "next/server";
import { requireAdminJson } from "@/app/api/admin/_auth";
import { isAdminEmail, isAdminUserId } from "@/lib/admin";
import { ADMIN_BALANCE } from "@/lib/points-constants";
import { createServiceRoleClient } from "@/utils/supabase/service-role";
import type { AdminUsersApiRow } from "@/lib/admin-users-api-types";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

function displayNameFromUser(u: User): string {
  const m = u.user_metadata as Record<string, unknown> | null | undefined;
  const raw =
    (typeof m?.nickname === "string" && m.nickname) ||
    (typeof m?.full_name === "string" && m.full_name) ||
    (typeof m?.name === "string" && m.name) ||
    u.email?.split("@")[0] ||
    "";
  const s = String(raw).trim();
  return s || "익명";
}

const UUID_FULL =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function userMatchesNeedle(u: User, needleLower: string): boolean {
  const id = u.id.toLowerCase();
  const email = (u.email ?? "").toLowerCase();
  const phone = (u.phone ?? "").toLowerCase();
  const display = displayNameFromUser(u).toLowerCase();
  return (
    id.includes(needleLower) ||
    email.includes(needleLower) ||
    phone.includes(needleLower) ||
    display.includes(needleLower)
  );
}

async function mapAuthUsersToRows(
  svc: SupabaseClient,
  authUsers: User[],
): Promise<AdminUsersApiRow[]> {
  const ids = authUsers.map((u) => u.id).filter(Boolean);
  const profileById = new Map<string, { pebbles: number; level: number }>();

  if (ids.length > 0) {
    const { data: profiles, error: pErr } = await svc
      .from("profiles")
      .select("id, pebbles, level")
      .in("id", ids);

    if (pErr) {
      throw new Error(pErr.message);
    }

    for (const row of (profiles ?? []) as {
      id?: string;
      pebbles?: number | null;
      level?: number | null;
    }[]) {
      if (!row.id) continue;
      profileById.set(row.id, {
        pebbles: Math.max(0, Math.floor(Number(row.pebbles ?? 0))),
        level: Math.max(1, Math.min(56, Math.floor(Number(row.level ?? 1)))),
      });
    }
  }

  return authUsers.map((u) => {
    const prof = profileById.get(u.id);
    const profileMissing = !prof;
    const adminEmail = isAdminEmail(u.email) || isAdminUserId(u.id);

    let pebbles: number;
    if (adminEmail) {
      pebbles = ADMIN_BALANCE;
    } else if (prof) {
      pebbles = prof.pebbles;
    } else {
      pebbles = 0;
    }

    return {
      id: u.id,
      email: u.email ?? "",
      displayName: displayNameFromUser(u),
      createdAt: u.created_at ?? null,
      pebbles,
      level: prof?.level ?? 1,
      profileMissing,
      isAdminEmail: adminEmail,
    };
  });
}

/** 검색용: auth 유저 전부 페이지 순회 (listUsers 필터 미지원) */
async function fetchAllAuthUsersForSearch(
  svc: SupabaseClient,
): Promise<{ users: User[]; truncated: boolean }> {
  const perFetch = 1000;
  const MAX_PAGES = 500;
  const all: User[] = [];
  let truncated = false;

  for (let p = 1; p <= MAX_PAGES; p++) {
    const { data, error } = await svc.auth.admin.listUsers({
      page: p,
      perPage: perFetch,
    });
    if (error) {
      throw new Error(error.message);
    }
    const batch = data.users ?? [];
    all.push(...batch);
    if (batch.length < perFetch) break;
    if (p === MAX_PAGES) truncated = true;
  }

  return { users: all, truncated };
}

export async function GET(request: Request) {
  const gate = await requireAdminJson();
  if (!gate.ok) return gate.response;

  try {
    const url = new URL(request.url);
    const page = Math.max(1, parseInt(url.searchParams.get("page") ?? "1", 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(url.searchParams.get("pageSize") ?? "50", 10) || 50),
    );
    const qRaw = (url.searchParams.get("q") ?? "").trim();
    const qLower = qRaw.toLowerCase();

    const svc = createServiceRoleClient();

    if (!qRaw) {
      const { data: listPayload, error: listErr } = await svc.auth.admin.listUsers({
        page,
        perPage: pageSize,
      });

      if (listErr) {
        return NextResponse.json({ ok: false, error: listErr.message }, { status: 500 });
      }

      const authUsers = listPayload.users ?? [];
      const total =
        typeof (listPayload as { total?: number }).total === "number"
          ? (listPayload as { total: number }).total
          : authUsers.length;

      let users: AdminUsersApiRow[];
      try {
        users = await mapAuthUsersToRows(svc, authUsers);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        users,
        page,
        pageSize,
        total,
      });
    }

    /** 완전한 UUID 한 건만 빠르게 조회 */
    if (UUID_FULL.test(qRaw)) {
      const { data: one, error: oneErr } = await svc.auth.admin.getUserById(qRaw);
      if (oneErr) {
        return NextResponse.json(
          { ok: false, error: oneErr.message },
          { status: 500 },
        );
      }
      if (!one?.user) {
        return NextResponse.json({
          ok: true,
          users: [],
          page: 1,
          pageSize,
          total: 0,
          search: qRaw,
        });
      }

      let users: AdminUsersApiRow[];
      try {
        users = await mapAuthUsersToRows(svc, [one.user]);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return NextResponse.json({ ok: false, error: msg }, { status: 500 });
      }

      return NextResponse.json({
        ok: true,
        users,
        page: 1,
        pageSize,
        total: users.length,
        search: qRaw,
      });
    }

    /** 부분 문자열: 전체 목록 스캔 후 필터 (관리 화면 전용) */
    let scanned: User[];
    let truncated: boolean;
    try {
      const r = await fetchAllAuthUsersForSearch(svc);
      scanned = r.users;
      truncated = r.truncated;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }

    const filtered = scanned.filter((u) => userMatchesNeedle(u, qLower));
    const total = filtered.length;
    const start = (page - 1) * pageSize;
    const slice = filtered.slice(start, start + pageSize);

    let users: AdminUsersApiRow[];
    try {
      users = await mapAuthUsersToRows(svc, slice);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ ok: false, error: msg }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      users,
      page,
      pageSize,
      total,
      search: qRaw,
      searchScanned: scanned.length,
      searchTruncated: truncated,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
