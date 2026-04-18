"use client";

import { useSearchParams } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { CommunityBoard } from "@/components/community-board";
import { useUserPointsBalance } from "@/lib/points";
import { isValidBoardTab } from "@/lib/board-navigation";
import type { FilterId } from "@/components/category-filter";

export function BoardIndexClient() {
  const { userId, points: userBalance } = useUserPointsBalance();
  const searchParams = useSearchParams();
  const tabRaw = searchParams.get("tab");
  const activeFilter: FilterId | undefined = isValidBoardTab(tabRaw) ? tabRaw : undefined;
  const activeSubTabId = searchParams.get("sub") ?? undefined;

  return (
    <div className="min-h-screen bg-background">
      <Navbar balance={userBalance} userId={userId} />
      <main className="px-4 pb-10 pt-4 mx-auto max-w-4xl">
        <CommunityBoard
          activeFilter={activeFilter}
          activeSubTabId={activeSubTabId}
          className="min-h-[calc(100vh-120px)]"
        />
      </main>
    </div>
  );
}
