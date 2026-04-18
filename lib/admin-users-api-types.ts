/** GET /api/admin/users 응답 — 클라이언트·서버 공유 */

export type AdminUsersApiRow = {
  id: string;
  email: string;
  displayName: string;
  createdAt: string | null;
  /** profiles.pebbles — 프로필 없으면 0 (운영자 이메일은 고정 잔액) */
  pebbles: number;
  profileMissing: boolean;
  isAdminEmail: boolean;
};

export type AdminUsersApiResponse = {
  ok: true;
  users: AdminUsersApiRow[];
  page: number;
  pageSize: number;
  /** GoTrue x-total-count (없으면 현재 페이지 길이) */
  total: number;
  /** 검색 파라미터가 있었을 때 */
  search?: string;
  /** 부분 검색 시 스캔한 auth 유저 수 */
  searchScanned?: number;
  /** 스캔 상한에 도달 (일부만 검색됨) */
  searchTruncated?: boolean;
};
