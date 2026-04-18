import { normalizeHex6 } from "@/lib/option-colors";

function relativeLuminance(hex: string): number {
  const h = normalizeHex6(hex);
  if (!h) return 0.5;
  const rs = parseInt(h.slice(1, 3), 16) / 255;
  const gs = parseInt(h.slice(3, 5), 16) / 255;
  const bs = parseInt(h.slice(5, 7), 16) / 255;
  const lin = (u: number) => (u <= 0.03928 ? u / 12.92 : Math.pow((u + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(rs) + 0.7152 * lin(gs) + 0.0722 * lin(bs);
}

/**
 * 카드 배경이 대체로 밝다/어둡다고 가정하고 닉네임 글자색 가독성을 보정합니다.
 * inline style={{ color }} 에 넣을 문자열(hex 또는 color-mix).
 */
export function representativeInkForNickname(accentCss: string, prefersDark: boolean): string {
  const hex = normalizeHex6(accentCss);
  if (!hex) return accentCss;
  const L = relativeLuminance(hex);
  if (!prefersDark && L > 0.72) {
    return `color-mix(in srgb, ${hex} 42%, #0f172a)`;
  }
  if (prefersDark && L < 0.32) {
    return `color-mix(in srgb, ${hex} 48%, #f8fafc)`;
  }
  return hex;
}
