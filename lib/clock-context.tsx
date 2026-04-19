"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";

const ClockContext = createContext<Date>(new Date());

/**
 * 30초마다 갱신되는 공유 시각 컨텍스트.
 * 자식 컴포넌트(MarketCard 등)가 개별 setInterval을 갖지 않아도 됩니다.
 */
export function ClockProvider({ children }: { children: React.ReactNode }) {
  const [now, setNow] = useState(() => new Date());
  const ref = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    ref.current = setInterval(() => setNow(new Date()), 30_000);
    return () => {
      if (ref.current !== null) clearInterval(ref.current);
    };
  }, []);

  return <ClockContext.Provider value={now}>{children}</ClockContext.Provider>;
}

/** MarketCard 등에서 사용. ClockProvider 범위 밖이면 현재 시각을 직접 반환. */
export function useClock(): Date {
  return useContext(ClockContext);
}
