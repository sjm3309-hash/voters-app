/**
 * 닉네임 예약어 — 운영자·관리자 계정과 혼동될 수 있는 단어를 일반 유저가 사용하지 못하도록 차단합니다.
 * 대소문자 및 전각/반각 구분 없이 정규화 후 비교합니다.
 */
export const RESERVED_NICKNAMES: string[] = [
  // 한국어
  "운영자", "관리자", "어드민", "운영", "관리",
  "시스템", "공지", "공지사항", "고객센터",
  "보트팀", "voters팀", "voters운영", "공식",
  // 영어
  "admin", "administrator", "operator", "moderator", "mod",
  "staff", "official", "system", "support", "help",
  "root", "superuser", "super",
];

/** 닉네임을 비교용으로 정규화 (소문자 + 공백 제거) */
function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, "");
}

/** 해당 닉네임이 예약어인지 확인 */
export function isReservedNickname(nickname: string): boolean {
  const n = normalize(nickname);
  return RESERVED_NICKNAMES.some((r) => normalize(r) === n);
}
