"use client";

/**
 * DailyRewardTrigger
 *
 * 로그인된 유저가 앱을 열면 자동으로 일일 출석 보상을 요청합니다.
 * - 오늘 이미 수령했으면 조용히 종료 (alreadyClaimed)
 * - 처음 수령이면 토스트 알림 표시
 *
 * layout.tsx 또는 Navbar에 한 번만 마운트하세요.
 */

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { useUserPointsBalance } from "@/lib/points";

export function DailyRewardTrigger() {
  const { userId } = useUserPointsBalance();
  const calledRef = useRef(false);

  useEffect(() => {
    if (!userId || userId === "anon" || calledRef.current) return;
    calledRef.current = true;

    const claim = async () => {
      try {
        const res = await fetch("/api/pebbles/daily-reward", {
          method: "POST",
          credentials: "same-origin",
        });

        if (!res.ok) return;

        const j = (await res.json()) as {
          ok?: boolean;
          alreadyClaimed?: boolean;
          reward?: number;
          level?: number;
          newBalance?: number;
        };

        if (!j.ok || j.alreadyClaimed) return;

        // 잔액 갱신 트리거
        window.dispatchEvent(new CustomEvent("voters:balanceUpdated"));

        // 토스트 알림
        if (j.reward && j.level) {
          toast.success(
            `Lv.${j.level} 일일 출석 보상으로 ${j.reward.toLocaleString()}P 지급됐습니다! 🎉`,
            {
              description: `현재 잔액: ${j.newBalance?.toLocaleString() ?? "—"}P`,
              duration: 5000,
              position: "top-center",
            },
          );
        }
      } catch {
        // 네트워크 오류는 조용히 무시
      }
    };

    void claim();
  }, [userId]);

  return null;
}
