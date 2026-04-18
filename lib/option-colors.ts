/**
 * 보트 옵션 색상 — DB hex 저장 · UI 대비(fallback·글자색) 공통 처리
 */

export const OPTION_FALLBACK_HEX = [
  "#6366f1",
  "#22c55e",
  "#ef4444",
  "#eab308",
  "#a855f7",
  "#e5e7eb",
  "#3b82f6",
] as const;

/** DB에 색이 없거나 파싱 불가일 때 순서대로 사용 */
const CSS_COLOR_PREFIX = /^(oklch|hsl|hwb|lab|lch|rgb|rgba|color)\(/i;

/** `#rgb` / `#rrggbb` → 소문자 `#rrggbb` */
export function normalizeHex6(input: string | null | undefined): string | null {
  if (input == null) return null;
  const s = String(input).trim();
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(s);
  if (!m) return null;
  let h = m[1];
  if (h.length === 3) {
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  return `#${h.toLowerCase()}`;
}

export function isValidOptionHex(input: unknown): input is string {
  return typeof input === "string" && normalizeHex6(input) != null;
}

export function fallbackHexByIndex(i: number): string {
  return OPTION_FALLBACK_HEX[i % OPTION_FALLBACK_HEX.length]!;
}

/**
 * DB/API에 저장된 선택지 색 문자열 복원 — `#rrggbb` 또는 `oklch()` 등만 통과, 그 외는 null.
 * 보트 만들기 폼은 기본값으로 oklch를 쓰므로 hex만 허용하면 피드에서 색이 전부 버려진다.
 */
export function parseStoredOptionColor(raw: unknown): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  const hex = normalizeHex6(s);
  if (hex) return hex;
  if (CSS_COLOR_PREFIX.test(s)) return s;
  return null;
}

/**
 * 옵션 색상 정규화 — 유효한 hex/CSS 컬러면 그대로, 없으면 인덱스별 fallback
 */
export function resolveOptionColor(raw: string | null | undefined, index: number): string {
  if (raw != null && String(raw).trim() !== "") {
    const s = String(raw).trim();
    const hex = normalizeHex6(s);
    if (hex) return hex;
    if (CSS_COLOR_PREFIX.test(s)) return s;
  }
  return fallbackHexByIndex(index);
}

/** hex만 완전 변환 가능 — 그 외(CSS 함수 등)는 color-mix 문자열 반환 */
export function hexToRgba(hexInput: string, alpha: number): string | null {
  const hex = normalizeHex6(hexInput);
  if (!hex) return null;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const a = Math.min(1, Math.max(0, alpha));
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** 미선택 버튼 배경 — 옅게 */
export function accentMutedBackground(accent: string): string {
  return hexToRgba(accent, 0.14) ?? `color-mix(in srgb, ${accent} 14%, white)`;
}

/** 미선택 버튼 테두리 */
export function accentMutedBorder(accent: string): string {
  return hexToRgba(accent, 0.42) ?? `color-mix(in srgb, ${accent} 48%, transparent)`;
}

/** 차트 막대 테두리 등 */
export function accentStroke(accent: string): string {
  return hexToRgba(accent, 0.92) ?? accent;
}

/** WCAG 상대 명도 기반 — 배경이 밝으면 어두운 글자 */
export function pickReadableTextOnAccent(hexInput: string): "#ffffff" | "#0f172a" {
  const hex = normalizeHex6(hexInput);
  if (!hex) return "#0f172a";
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (u: number) =>
    u <= 0.03928 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.55 ? "#0f172a" : "#ffffff";
}
