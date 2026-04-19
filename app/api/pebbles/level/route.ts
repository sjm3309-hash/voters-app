import { NextResponse } from "next/server";

/**
 * POST /api/pebbles/level — 폐기됨
 *
 * 이 엔드포인트는 클라이언트가 임의로 레벨을 설정할 수 있어
 * 보안상 위험하므로 비활성화합니다.
 * 레벨 변경은 반드시 /api/pebbles/level-up (비용 검증 포함) 을 통해서만 가능합니다.
 */
export async function POST() {
  return NextResponse.json(
    { ok: false, error: "deprecated", message: "레벨은 /api/pebbles/level-up 을 통해서만 변경할 수 있습니다." },
    { status: 410 },
  );
}
