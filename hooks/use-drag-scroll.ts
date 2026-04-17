"use client";

import { useMemo, useRef } from "react";

/**
 * 가로 스크롤 영역을 마우스로 드래그해서 이동할 수 있게 합니다.
 * (모바일은 기본 touch scroll)
 */
export function useDragScroll<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const state = useRef({
    dragging: false,
    startX: 0,
    startScrollLeft: 0,
  });

  const handlers = useMemo(() => {
    return {
      onMouseDown: (e: React.MouseEvent) => {
        const el = ref.current;
        if (!el) return;
        state.current.dragging = true;
        state.current.startX = e.pageX;
        state.current.startScrollLeft = el.scrollLeft;
      },
      onMouseMove: (e: React.MouseEvent) => {
        const el = ref.current;
        if (!el) return;
        if (!state.current.dragging) return;
        e.preventDefault();
        const dx = e.pageX - state.current.startX;
        el.scrollLeft = state.current.startScrollLeft - dx;
      },
      onMouseUp: () => {
        state.current.dragging = false;
      },
      onMouseLeave: () => {
        state.current.dragging = false;
      },
    };
  }, []);

  return { ref, handlers };
}

