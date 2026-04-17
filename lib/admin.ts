/** 운영자(관리자) 이메일 목록 */
export const ADMIN_EMAILS: string[] = [
  "sjm3309@gmail.com",
];

/** 해당 이메일이 운영자인지 확인 */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase().trim());
}
