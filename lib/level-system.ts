/**
 * VOTERS 레벨 시스템
 *
 * 도형 7종 × 색상 8종 = 56 단계
 * 도형: 동그라미 → 삼각형 → 사각형 → 오각형 → 육각형 → 칠각형 → 팔각형
 * 색상: 빨강 → 주황 → 노랑 → 초록 → 파랑 → 남색 → 보라 → 무지개
 */

export type ShapeName =
  | "circle"
  | "triangle"
  | "square"
  | "pentagon"
  | "hexagon"
  | "heptagon"
  | "octagon";

export type ColorName =
  | "red"
  | "orange"
  | "yellow"
  | "green"
  | "blue"
  | "indigo"
  | "purple"
  | "rainbow";

export const SHAPES: ShapeName[] = [
  "circle",
  "triangle",
  "square",
  "pentagon",
  "hexagon",
  "heptagon",
  "octagon",
];

export const COLORS: ColorName[] = [
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "indigo",
  "purple",
  "rainbow",
];

export const SHAPE_KO: Record<ShapeName, string> = {
  circle:   "동그라미",
  triangle: "삼각형",
  square:   "사각형",
  pentagon: "오각형",
  hexagon:  "육각형",
  heptagon: "칠각형",
  octagon:  "팔각형",
};

export const COLOR_KO: Record<ColorName, string> = {
  red:     "빨강",
  orange:  "주황",
  yellow:  "노랑",
  green:   "초록",
  blue:    "파랑",
  indigo:  "남색",
  purple:  "보라",
  rainbow: "무지개",
};

/** SVG fill 색상 (rainbow는 null → 그라디언트 처리) */
export const COLOR_HEX: Record<ColorName, string | null> = {
  red:     "#ef4444",
  orange:  "#f97316",
  yellow:  "#eab308",
  green:   "#22c55e",
  blue:    "#3b82f6",
  indigo:  "#6366f1",
  purple:  "#a855f7",
  rainbow: null,
};

// ─── 포인트 기준점 (56단계, 누적 합산) ──────────────────────────────────────
//
// 각 항목은 해당 레벨에 도달하기 위해 필요한 누적 포인트입니다.
//
// 레벨별 다음 단계 필요 포인트 (증분):
//   Lv1→2:  1,000    Lv10→11: 63,100   Lv20→21: 219,600
//   Lv2→3:  3,500    Lv11→12: 76,580   Lv25→26: 328,000
//   Lv3→4:  7,200    Lv12→13: 90,060   Lv30→31: 455,600
//   Lv4→5:  12,100   Lv13→14: 103,540  Lv35→36: 601,300
//   Lv5→6:  18,100   Lv14→15: 117,020  Lv40→41: 761,500
//   Lv6→7:  24,900   Lv15→16: 130,500  Lv45→46: 938,600
//   Lv7→8:  32,500   Lv16→17: 148,320  Lv50→51: 1,128,800
//   Lv8→9:  41,000   Lv17→18: 166,140  Lv55→56: 1,353,600
//   Lv9→10: 50,200   Lv18→19: 183,960
//
// Lv11~14, Lv16~19, ... 등 미제공 구간은 인접 값 사이 선형 보간

export const TIER_THRESHOLDS: number[] = [
  // ── 동그라미 (Lv.1 ~ Lv.8) ────────────────────────────────────────────────
  0,           // Lv.1  빨강  동그라미  — 시작
  1_000,       // Lv.2  주황  동그라미  — +1,000
  4_500,       // Lv.3  노랑  동그라미  — +3,500
  11_700,      // Lv.4  초록  동그라미  — +7,200
  23_800,      // Lv.5  파랑  동그라미  — +12,100
  41_900,      // Lv.6  남색  동그라미  — +18,100
  66_800,      // Lv.7  보라  동그라미  — +24,900
  99_300,      // Lv.8  무지개 동그라미 — +32,500

  // ── 삼각형 (Lv.9 ~ Lv.16) ────────────────────────────────────────────────
  140_300,     // Lv.9  빨강  삼각형    — +41,000
  190_500,     // Lv.10 주황  삼각형    — +50,200
  253_600,     // Lv.11 노랑  삼각형    — +63,100  (누적 ~25만 P)
  330_180,     // Lv.12 초록  삼각형    — +76,580  (보간)
  420_240,     // Lv.13 파랑  삼각형    — +90,060  (보간)
  523_780,     // Lv.14 남색  삼각형    — +103,540 (보간)
  640_800,     // Lv.15 보라  삼각형    — +117,020 (보간)
  771_300,     // Lv.16 무지개 삼각형   — +130,500

  // ── 사각형 (Lv.17 ~ Lv.24) ───────────────────────────────────────────────
  919_620,     // Lv.17 빨강  사각형    — +148,320 (보간)
  1_085_760,   // Lv.18 주황  사각형    — +166,140 (보간)
  1_269_720,   // Lv.19 노랑  사각형    — +183,960 (보간)
  1_471_500,   // Lv.20 초록  사각형    — +201,780 (보간)
  1_691_100,   // Lv.21 파랑  사각형    — +219,600 (누적 ~170만 P)
  1_932_380,   // Lv.22 남색  사각형    — +241,280 (보간)
  2_195_340,   // Lv.23 보라  사각형    — +262,960 (보간)
  2_479_980,   // Lv.24 무지개 사각형   — +284,640 (보간)

  // ── 오각형 (Lv.25 ~ Lv.32) ───────────────────────────────────────────────
  2_786_300,   // Lv.25 빨강  오각형    — +306,320 (보간)
  3_114_300,   // Lv.26 주황  오각형    — +328,000 (누적 ~310만 P)
  3_467_820,   // Lv.27 노랑  오각형    — +353,520 (보간)
  3_846_860,   // Lv.28 초록  오각형    — +379,040 (보간)
  4_251_420,   // Lv.29 파랑  오각형    — +404,560 (보간)
  4_681_500,   // Lv.30 남색  오각형    — +430,080 (보간)
  5_137_100,   // Lv.31 보라  오각형    — +455,600 (누적 ~510만 P)
  5_621_840,   // Lv.32 무지개 오각형   — +484,740 (보간)

  // ── 육각형 (Lv.33 ~ Lv.40) ───────────────────────────────────────────────
  6_135_720,   // Lv.33 빨강  육각형    — +513,880 (보간)
  6_678_740,   // Lv.34 주황  육각형    — +543,020 (보간)
  7_250_900,   // Lv.35 노랑  육각형    — +572,160 (보간)
  7_852_200,   // Lv.36 초록  육각형    — +601,300 (누적 ~790만 P)
  8_485_540,   // Lv.37 파랑  육각형    — +633,340 (보간)
  9_150_920,   // Lv.38 남색  육각형    — +665,380 (보간)
  9_848_340,   // Lv.39 보라  육각형    — +697,420 (보간)
  10_577_800,  // Lv.40 무지개 육각형   — +729,460 (보간)

  // ── 칠각형 (Lv.41 ~ Lv.48) ───────────────────────────────────────────────
  11_339_300,  // Lv.41 빨강  칠각형    — +761,500 (누적 ~1,130만 P)
  12_136_220,  // Lv.42 주황  칠각형    — +796,920 (보간)
  12_968_560,  // Lv.43 노랑  칠각형    — +832,340 (보간)
  13_836_320,  // Lv.44 초록  칠각형    — +867,760 (보간)
  14_739_500,  // Lv.45 파랑  칠각형    — +903,180 (보간)
  15_678_100,  // Lv.46 남색  칠각형    — +938,600 (누적 ~1,570만 P)
  16_654_740,  // Lv.47 보라  칠각형    — +976,640 (보간)
  17_669_420,  // Lv.48 무지개 칠각형   — +1,014,680 (보간)

  // ── 팔각형 (Lv.49 ~ Lv.56) ───────────────────────────────────────────────
  18_722_140,  // Lv.49 빨강  팔각형    — +1,052,720 (보간)
  19_812_900,  // Lv.50 주황  팔각형    — +1,090,760 (보간)
  20_941_700,  // Lv.51 노랑  팔각형    — +1,128,800 (누적 ~2,090만 P)
  22_115_460,  // Lv.52 초록  팔각형    — +1,173,760 (보간)
  23_334_180,  // Lv.53 파랑  팔각형    — +1,218,720 (보간)
  24_597_860,  // Lv.54 남색  팔각형    — +1,263,680 (보간)
  25_906_500,  // Lv.55 보라  팔각형    — +1,308,640 (보간)
  27_260_100,  // Lv.56 무지개 팔각형   — +1,353,600 (MAX)
];

// ─── 수동 레벨 저장소 ─────────────────────────────────────────────────────────
// 유저가 직접 레벨업 버튼을 눌러 페블을 소모하고 레벨을 올리는 시스템

const MANUAL_LEVEL_KEY = (uid: string) => `voters.mlevel.v1.${uid}`;

/** 유저의 현재 저장된 레벨 반환 (기본 1) */
export function getUserManualLevel(userId: string): number {
  if (typeof window === "undefined" || !userId || userId === "anon") return 1;
  const raw = window.localStorage.getItem(MANUAL_LEVEL_KEY(userId));
  if (!raw) return 1;
  const n = parseInt(raw, 10);
  return Number.isFinite(n) && n >= 1 && n <= 56 ? n : 1;
}

/** 유저 레벨 저장 + `voters:levelUpdated` 이벤트 발송 */
export function setUserManualLevel(userId: string, level: number): void {
  if (typeof window === "undefined" || !userId || userId === "anon") return;
  const clamped = Math.max(1, Math.min(56, level));
  window.localStorage.setItem(MANUAL_LEVEL_KEY(userId), String(clamped));
  window.dispatchEvent(
    new CustomEvent("voters:levelUpdated", { detail: { userId, level: clamped } })
  );
}

/** currentLevel → nextLevel 레벨업에 필요한 페블 */
export function getLevelUpCost(currentLevel: number): number {
  if (currentLevel >= 56) return Infinity;
  return (TIER_THRESHOLDS[currentLevel] ?? 0) - (TIER_THRESHOLDS[currentLevel - 1] ?? 0);
}

/** 레벨 번호(1-56)로 LevelTier 반환 */
export function getTierByLevel(level: number): LevelTier {
  const tier = Math.max(0, Math.min(level - 1, 55));
  const shapeIndex = Math.floor(tier / 8);
  const colorIndex = tier % 8;
  const shape = SHAPES[shapeIndex] as ShapeName;
  const color = COLORS[colorIndex] as ColorName;
  const currentThreshold = TIER_THRESHOLDS[tier] ?? 0;
  const nextThreshold = TIER_THRESHOLDS[tier + 1] ?? null;
  return {
    tier,
    level: tier + 1,
    shapeIndex,
    colorIndex,
    shape,
    color,
    label: `${COLOR_KO[color]} ${SHAPE_KO[shape]}`,
    currentThreshold,
    nextThreshold,
    progress: 0,
  };
}

// ─── 작성자명 → 포인트 캐시 ──────────────────────────────────────────────────
// 게시글/댓글의 작성자 이름으로 레벨 아이콘을 표시하기 위한 로컬 캐시

const AUTHOR_CACHE_KEY = "voters.author.lvl.v1";
const AUTHOR_MANUAL_LEVEL_KEY = "voters.author.manual-level.v1";

export function cacheAuthorLevel(displayName: string, points: number): void {
  if (typeof window === "undefined" || !displayName) return;
  try {
    const raw = window.localStorage.getItem(AUTHOR_CACHE_KEY);
    const cache: Record<string, number> = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    cache[displayName] = points;
    window.localStorage.setItem(AUTHOR_CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

export function getCachedAuthorPoints(displayName: string): number {
  if (typeof window === "undefined" || !displayName) return 0;
  try {
    const raw = window.localStorage.getItem(AUTHOR_CACHE_KEY);
    if (!raw) return 0;
    const cache = JSON.parse(raw) as Record<string, number>;
    const v = cache[displayName];
    return typeof v === "number" ? v : 0;
  } catch {
    return 0;
  }
}

/** 작성자 이름 → 수동 레벨 캐시에 저장 (게시글/댓글 아이콘 표시용) */
export function cacheAuthorManualLevel(displayName: string, level: number): void {
  if (typeof window === "undefined" || !displayName) return;
  try {
    const raw = window.localStorage.getItem(AUTHOR_MANUAL_LEVEL_KEY);
    const cache: Record<string, number> = raw ? (JSON.parse(raw) as Record<string, number>) : {};
    cache[displayName] = Math.max(1, Math.min(56, level));
    window.localStorage.setItem(AUTHOR_MANUAL_LEVEL_KEY, JSON.stringify(cache));
  } catch {}
}

/** 작성자 이름으로 수동 레벨 조회 (없으면 null) */
export function getCachedAuthorManualLevel(displayName: string): number | null {
  if (typeof window === "undefined" || !displayName) return null;
  try {
    const raw = window.localStorage.getItem(AUTHOR_MANUAL_LEVEL_KEY);
    if (!raw) return null;
    const cache = JSON.parse(raw) as Record<string, number>;
    const v = cache[displayName];
    return typeof v === "number" && v >= 1 && v <= 56 ? v : null;
  } catch {
    return null;
  }
}

// ─── 공개 API ─────────────────────────────────────────────────────────────────

export interface LevelTier {
  tier: number;          // 0-55 (0-indexed)
  level: number;         // 1-56
  shapeIndex: number;    // 0-6
  colorIndex: number;    // 0-7
  shape: ShapeName;
  color: ColorName;
  label: string;         // 예: "초록 동그라미"
  currentThreshold: number;
  nextThreshold: number | null;
  progress: number;      // 0~1, 다음 레벨까지 진행도
}

export function getLevelTier(points: number): LevelTier {
  let tier = 0;
  for (let i = TIER_THRESHOLDS.length - 1; i >= 0; i--) {
    if (points >= (TIER_THRESHOLDS[i] ?? 0)) {
      tier = i;
      break;
    }
  }

  const shapeIndex = Math.floor(tier / 8);
  const colorIndex = tier % 8;
  const shape = SHAPES[shapeIndex] as ShapeName;
  const color = COLORS[colorIndex] as ColorName;

  const currentThreshold = TIER_THRESHOLDS[tier] ?? 0;
  const nextThreshold    = TIER_THRESHOLDS[tier + 1] ?? null;

  const progress =
    nextThreshold !== null
      ? Math.min(1, (points - currentThreshold) / (nextThreshold - currentThreshold))
      : 1;

  return {
    tier,
    level: tier + 1,
    shapeIndex,
    colorIndex,
    shape,
    color,
    label: `${COLOR_KO[color]} ${SHAPE_KO[shape]}`,
    currentThreshold,
    nextThreshold,
    progress,
  };
}
