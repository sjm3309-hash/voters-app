/**
 * 서버 전용 유틸리티: user_moderation 테이블에서 차단/정지 여부를 확인합니다.
 * place-bet, board-posts POST, post-comments POST 등 write API에서 호출하세요.
 */
import { createServiceRoleClient } from "@/utils/supabase/service-role";

type ModerationRow = {
  is_banned: boolean;
  suspended_until: string | null;
};

type ModerationResult =
  | { blocked: false }
  | { blocked: true; reason: "banned" | "suspended"; message: string };

/**
 * userId 가 현재 차단(ban) 또는 정지(suspend) 상태인지 확인합니다.
 * 차단/정지 상태이면 { blocked: true, ... } 를 반환하고,
 * 정상이거나 레코드가 없으면 { blocked: false } 를 반환합니다.
 */
export async function checkUserModeration(userId: string): Promise<ModerationResult> {
  try {
    const svc = createServiceRoleClient();
    const { data } = await svc
      .from("user_moderation")
      .select("is_banned, suspended_until")
      .eq("user_id", userId)
      .maybeSingle();

    if (!data) return { blocked: false };

    const row = data as ModerationRow;

    if (row.is_banned) {
      return { blocked: true, reason: "banned", message: "계정이 차단되어 이 기능을 사용할 수 없습니다." };
    }

    if (row.suspended_until) {
      const until = new Date(row.suspended_until);
      if (until > new Date()) {
        const formatted = until.toLocaleDateString("ko-KR", {
          year: "numeric",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });
        return {
          blocked: true,
          reason: "suspended",
          message: `일시 정지 중입니다. 해제 일시: ${formatted}`,
        };
      }
    }

    return { blocked: false };
  } catch {
    // DB 오류 시 요청을 차단하지 않음 (가용성 우선)
    return { blocked: false };
  }
}
