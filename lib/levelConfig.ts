/**
 * VOTERS 레벨 경제 밸런스 설정
 *
 * 레벨업 비용: BASE * level^2.3   (기하급수적 증가)
 * 일일 보상:   900 + level * 100  (산술적 증가, Lv.1 = 1,000P)
 *
 * → 고레벨일수록 본전 회수 기간(ROI)이 길어지는 구조
 *   Lv.1→2 ≈ 0.1일 / Lv.25→26 ≈ 83일 / Lv.55→56 ≈ 251일
 *
 * 누적 비용 Lv.1→56 ≈ 27,000,000P
 */

/** 레벨업 비용 계수. sum(N^2.3, N=1..55) ≈ 168,000 → 27M/168,000 ≈ 161 */
const BASE = 161;

export interface LevelEntry {
  level: number;
  /** 이 레벨 → 다음 레벨로 가기 위해 필요한 페블 (Lv.56 = Infinity) */
  upgradeCost: number;
  /** 이 레벨에서 매일 받는 출석 보상 페블 */
  dailyReward: number;
}

function round100(n: number): number {
  return Math.round(n / 100) * 100;
}

/** Lv.1 ~ Lv.56 전체 설정 (index = level - 1) */
export const LEVEL_CONFIG: LevelEntry[] = Array.from({ length: 56 }, (_, i) => {
  const level = i + 1;
  const rawCost = BASE * Math.pow(level, 2.3);
  return {
    level,
    upgradeCost: level < 56 ? Math.max(100, round100(rawCost)) : Infinity,
    dailyReward: round100(900 + level * 100),
  };
});

/** 특정 레벨의 설정 반환 (범위 클램핑 포함) */
export function getLevelEntry(level: number): LevelEntry {
  const idx = Math.max(0, Math.min(55, Math.floor(level) - 1));
  return LEVEL_CONFIG[idx]!;
}

/** 레벨업 비용 반환 (MAX 레벨이면 Infinity) */
export function getUpgradeCost(currentLevel: number): number {
  return getLevelEntry(currentLevel).upgradeCost;
}

/** 해당 레벨에서의 일일 출석 보상 반환 */
export function getDailyReward(level: number): number {
  return getLevelEntry(level).dailyReward;
}

/** 누적 레벨업 비용 (Lv.1 → targetLevel 까지 도달하는 데 필요한 총 페블) */
export function getCumulativeCost(targetLevel: number): number {
  if (targetLevel <= 1) return 0;
  let total = 0;
  for (let lv = 1; lv < Math.min(targetLevel, 56); lv++) {
    const cost = LEVEL_CONFIG[lv - 1]!.upgradeCost;
    if (!isFinite(cost)) break;
    total += cost;
  }
  return total;
}

/** 레벨업 ROI: 비용을 일일 보상으로 나눈 일수 (소수점 1자리) */
export function getUpgradeRoiDays(currentLevel: number): number | null {
  const entry = getLevelEntry(currentLevel);
  if (!isFinite(entry.upgradeCost)) return null;
  const nextReward = getLevelEntry(currentLevel + 1).dailyReward;
  if (nextReward <= 0) return null;
  return Math.round((entry.upgradeCost / nextReward) * 10) / 10;
}
