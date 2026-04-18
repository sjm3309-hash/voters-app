import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Supabase SSR 미들웨어 — 모든 요청에서 auth 토큰을 갱신하고 쿠키를 동기화합니다.
 * 이 파일 없이는 서버 컴포넌트/API Route에서 세션을 읽지 못할 수 있습니다.
 */
export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          // 요청 객체에도 반영
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          // 새 응답을 만들어 쿠키 전달
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // 세션 갱신 — 만료된 토큰을 자동으로 refresh 합니다
  // getUser()를 호출해야 토큰이 실제로 갱신됩니다 (getSession() 은 갱신 안 됨)
  await supabase.auth.getUser();

  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * 아래 경로를 제외한 모든 요청에 미들웨어 적용:
     * - _next/static  (정적 파일)
     * - _next/image   (이미지 최적화)
     * - favicon, 이미지 파일
     */
    "/((?!_next/static|_next/image|favicon|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
