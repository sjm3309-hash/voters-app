"use client";

import { Megaphone } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { CommunityBoard } from "@/components/community-board";
import { useUserPointsBalance } from "@/lib/points";

export function SuggestClient() {
  const { userId, points: balance } = useUserPointsBalance();
  return (
    <div className="min-h-screen bg-background">
      <Navbar balance={balance} userId={userId} />
      <main className="container max-w-4xl mx-auto px-4 py-6">
        <div className="mb-6 flex items-start gap-3">
          <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-chart-5/15 text-chart-5">
            <Megaphone className="size-5" aria-hidden />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight">건의 게시판</h1>
            <p className="text-sm text-muted-foreground mt-1">
              서비스 개선 아이디어와 건의를 남겨 주세요. 홈 상단의 건의 탭과 동일한 카테고리입니다.
            </p>
          </div>
        </div>
        <CommunityBoard activeFilter="suggest" className="min-h-[min(70vh,560px)]" />
      </main>
    </div>
  );
}
