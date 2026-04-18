/**
 * 운영자(관리자) 이메일 목록
 * 보안 강화를 위해 환경변수 ADMIN_EMAILS(쉼표 구분)로 이전을 권장합니다.
 * 예) .env.local → ADMIN_EMAILS=sjm3309@gmail.com,other@example.com
 */
export const ADMIN_EMAILS: string[] = (process.env.ADMIN_EMAILS ?? "sjm3309@gmail.com")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/** 해당 이메일이 운영자인지 확인 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase().trim());
}

/**
 * 클라이언트에서 사용 가능한 운영자 User ID 목록
 * NEXT_PUBLIC_ADMIN_USER_ID 환경변수에서 읽음 (쉼표로 복수 지정 가능)
 */
const ADMIN_USER_IDS: Set<string> = new Set(
  (process.env.NEXT_PUBLIC_ADMIN_USER_ID ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

/** 해당 userId가 운영자인지 확인 (클라이언트/서버 공용) */
export function isAdminUserId(userId: string | null | undefined): boolean {
  if (!userId) return false;
  return ADMIN_USER_IDS.has(userId);
}
