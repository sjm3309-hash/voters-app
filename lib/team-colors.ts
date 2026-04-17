/**
 * 팀명 키워드 → 시그니처 컬러 (홈 팀 강조·sync 저장용)
 * 긴 키워드를 먼저 매칭해 부분 일치 오매칭을 줄입니다.
 */

/** 보터스 기본 브랜드 (사전 미등록 팀) */
export const DEFAULT_BRAND_COLOR = "#8B5CF6";

/** e스포츠·해외축구 주요 팀 (Hex) */
const TEAM_COLOR_RAW: { keys: string[]; color: string }[] = [
  // ── e스포츠 (LoL 등) ─────────────────────────────────────────────
  { keys: ["t1", "티원"], color: "#E2012D" },
  { keys: ["gen.g", "geng", "젠지"], color: "#AA8A00" },
  { keys: ["dplus kia", "dpluskia", "디플러스"], color: "#00D7CA" },
  { keys: ["hanwha life", "hle", "한화 생명", "한화"], color: "#FF6B01" },
  { keys: ["kt rolster", "kt 롤스터"], color: "#000000" },
  { keys: ["drx"], color: "#5C34D0" },
  { keys: ["nongshim", "농심"], color: "#E60012" },
  { keys: ["liiv sandbox", "리브 샌드박스", "kdf", "kwangdong"], color: "#B4975A" },
  { keys: ["fearx", "bnk"], color: "#1E90FF" },
  { keys: ["cloud9", "c9"], color: "#00AEEF" },
  { keys: ["team liquid", "tl"], color: "#0A2342" },
  { keys: ["fnatic", "패나틱"], color: "#FF5900" },
  { keys: ["g2 esports"], color: "#000000" },
  { keys: ["jdg", "jd gaming"], color: "#C8102E" },
  { keys: ["bilibili", "blg"], color: "#3B82F6" },
  { keys: ["top esports", "tes"], color: "#E34234" },
  { keys: ["weibo", "wbg"], color: "#F59E0B" },
  { keys: ["edward gaming", "edg"], color: "#951E20" },
  { keys: ["rng", "royal never"], color: "#FFD700" },
  { keys: ["evil geniuses", "eg"], color: "#0C2340" },
  { keys: ["100 thieves", "100t"], color: "#D41920" },
  { keys: ["flyquest"], color: "#008040" },
  { keys: ["paper rex", "prx"], color: "#FF4655" },
  { keys: ["sentinels"], color: "#E11D48" },
  { keys: ["loud"], color: "#00C853" },
  // ── 해외 축구 ───────────────────────────────────────────────────
  { keys: ["liverpool", "리버풀"], color: "#C8102E" },
  { keys: ["manchester city", "맨체스터 시티", "맨시티", "man city"], color: "#6CABDD" },
  { keys: ["chelsea", "첼시"], color: "#034694" },
  { keys: ["real madrid", "레알 마드리드", "레알"], color: "#FEBE10" },
  { keys: ["barcelona", "바르셀로나", "바르사"], color: "#A8224E" },
  { keys: ["manchester united", "맨체스터 유나이티드", "맨유"], color: "#DA291C" },
  { keys: ["arsenal", "아스널"], color: "#EF0107" },
  { keys: ["tottenham", "토트넘", "spurs"], color: "#132257" },
  { keys: ["bayern", "바이에른"], color: "#DC052D" },
  { keys: ["borussia dortmund", "도르트문트", "bvb"], color: "#FDE100" },
  { keys: ["juventus", "유벤투스"], color: "#000000" },
  { keys: ["inter milan", "인테르", "인터 밀란"], color: "#0068A8" },
  { keys: ["ac milan", "밀란"], color: "#FB090B" },
  { keys: ["psg", "파리"], color: "#004170" },
  { keys: ["atletico", "아틀레티코"], color: "#CE3524" },
  { keys: ["sevilla", "세비야"], color: "#EE2524" },
  { keys: ["napoli", "나폴리"], color: "#12A0D7" },
  { keys: ["roma", "로마"], color: "#8E1F2F" },
];

function buildKeywordTable(): { key: string; color: string }[] {
  const out: { key: string; color: string }[] = [];
  for (const { keys, color } of TEAM_COLOR_RAW) {
    for (const k of keys) {
      const t = k.trim().toLowerCase();
      if (t) out.push({ key: t, color });
    }
  }
  out.sort((a, b) => b.key.length - a.key.length);
  return out;
}

const SORTED_KEYWORDS = buildKeywordTable();

export function getTeamColor(teamName: string): string {
  const n = teamName.trim().toLowerCase();
  if (!n) return DEFAULT_BRAND_COLOR;
  for (const { key, color } of SORTED_KEYWORDS) {
    if (n.includes(key)) return color;
  }
  return DEFAULT_BRAND_COLOR;
}
