/**
 * 신고 / 싫어요 관련 공유 상수 · 타입
 * 클라이언트와 서버 양쪽에서 import 가능 (next/headers 의존 없음)
 */

export type ReportTargetType =
  | "boat"
  | "boat_comment"
  | "board_post"
  | "board_comment";

export type DislikeTargetType = ReportTargetType;

export const REPORT_REASONS = [
  { id: "spam",       label: "스팸 / 도배" },
  { id: "hate",       label: "혐오 / 차별 표현" },
  { id: "false_info", label: "허위 정보" },
  { id: "obscene",    label: "음란 / 불법 콘텐츠" },
  { id: "harassment", label: "욕설 / 괴롭힘" },
  { id: "other",      label: "기타" },
] as const;

export type ReportReasonId = typeof REPORT_REASONS[number]["id"];
