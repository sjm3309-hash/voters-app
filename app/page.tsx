import { Suspense } from "react";
import { HomeClient } from "./home-client";

/** 메인 피드는 클라이언트 fetch이지만, 레이아웃/프리렌더 캐시 혼선 방지 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Home() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <HomeClient />
    </Suspense>
  );
}
