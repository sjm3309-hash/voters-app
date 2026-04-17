/** 자동 동기화 보트에 저장하는 표시용 작성자명 */
export const OFFICIAL_BET_AUTHOR_NAME = "VOTERS 운영자";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validateAdminUserId():
  | { ok: true; adminUserId: string }
  | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const id = process.env.ADMIN_USER_ID?.trim();
  if (!id) {
    errors.push("ADMIN_USER_ID가 설정되지 않았습니다. (운영자 계정의 auth.users UUID)");
  } else if (!UUID_RE.test(id)) {
    errors.push("ADMIN_USER_ID가 올바른 UUID 형식이 아닙니다.");
  }
  if (errors.length > 0) return { ok: false, errors };
  const adminUserId = process.env.ADMIN_USER_ID!.trim();
  return { ok: true, adminUserId };
}

export function officialSyncedBetColumns() {
  return {
    is_admin_generated: true,
    author_name: OFFICIAL_BET_AUTHOR_NAME,
  };
}
