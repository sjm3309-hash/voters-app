/** Supabase `bets.id` (UUID) 여부 — 로컬 `um-…` 보트와 구분 */
export function isUuidString(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    s.trim(),
  );
}
