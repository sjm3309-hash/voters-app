/** 보트 만들기 UI의 category id → DB `bets.category`(한글) */
export function marketCategoryIdToDbLabel(id: string): string {
  const map: Record<string, string> = {
    sports: "스포츠",
    fun: "재미",
    stocks: "주식",
    crypto: "크립토",
    politics: "정치",
    game: "게임",
    poljjak: "폴짝",
  };
  return map[id] ?? "재미";
}

const ALLOWED = new Set<string>([
  "sports",
  "fun",
  "stocks",
  "crypto",
  "politics",
  "game",
  "poljjak",
]);

export function isPublicMarketCategoryId(id: string): boolean {
  return ALLOWED.has(id);
}
