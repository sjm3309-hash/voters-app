"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Trophy, User, AlertOctagon } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useUserPointsBalance } from "@/lib/points";
import { UserModerationPanel } from "@/components/admin/UserModerationPanel";
import { cn } from "@/lib/utils";

type DashboardJson = {
  ok?: boolean;
  error?: string;
  market?: {
    id: string;
    question: string;
    category: string;
    subCategory?: string;
    endsAt: string;
    createdAt?: string;
    resultAt?: string;
    status?: string | null;
    winningOptionId?: string | null;
    options?: { id: string; label: string; color: string }[];
    creatorId?: string | null;
    creatorNickname?: string | null;
    creatorEmail?: string | null;
    isOfficial?: boolean;
  };
  stats?: {
    betCount: number;
    totalAmount: number;
    uniqueBettors: number;
    optionTotals: Record<string, number>;
  };
  history?: Record<string, unknown>[];
};

export function BettingDetailClient() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const { userId, points: balance } = useUserPointsBalance();
  const [data, setData] = useState<DashboardJson | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [settling, setSettling] = useState(false);
  const [settleErr, setSettleErr] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelMsg, setCancelMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (adminLoading) return;
    if (!isAdmin) { router.replace("/"); return; }
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(`/api/admin/bets/${encodeURIComponent(id)}/dashboard`, { credentials: "same-origin" });
        const json = (await res.json()) as DashboardJson;
        if (!res.ok || !json.ok) throw new Error(json.error || res.statusText);
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled) setErr(e instanceof Error ? e.message : "불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [adminLoading, isAdmin, id, router, reloadNonce]);

  if (adminLoading || (!loading && !isAdmin)) return null;

  const market = data?.market;
  const stats = data?.stats;
  const history = data?.history ?? [];

  const betFinalized =
    Boolean(market?.winningOptionId?.trim()) ||
    (market?.status &&
      ["settled", "resolved", "completed", "cancelled", "void"].includes(
        String(market.status).toLowerCase().trim(),
      ));

  const isCancelled = ["cancelled", "void"].includes(
    String(market?.status ?? "").toLowerCase().trim(),
  );

  async function confirmSettle(winningOptionId: string, label: string) {
    if (!id || !window.confirm(`「${label}」을(를) 결과 선택지로 확정할까요?`)) return;
    setSettling(true);
    setSettleErr(null);
    try {
      const res = await fetch(`/api/bets/${encodeURIComponent(id)}/settle`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ winningOptionId }),
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string };
      if (!res.ok || !j.ok) throw new Error(j.message || j.error || res.statusText);
      setReloadNonce((n) => n + 1);
    } catch (e) {
      setSettleErr(e instanceof Error ? e.message : "정산에 실패했습니다.");
    } finally {
      setSettling(false);
    }
  }

  async function handleCancel() {
    if (!id || !window.confirm("이 보트를 취소하고 모든 참여자에게 페블을 환불하시겠습니까?\n이 작업은 되돌릴 수 없습니다.")) return;
    setCancelling(true);
    setCancelMsg(null);
    try {
      const res = await fetch(`/api/admin/bets/${encodeURIComponent(id)}/cancel`, {
        method: "POST",
        credentials: "same-origin",
      });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error || res.statusText);
      setCancelMsg({ ok: true, text: j.message ?? "취소 완료" });
      setReloadNonce((n) => n + 1);
    } catch (e) {
      setCancelMsg({ ok: false, text: e instanceof Error ? e.message : "취소 실패" });
    } finally {
      setCancelling(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar balance={balance} userId={userId} />
      <div className="border-b border-border/50 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/admin/betting")}
            className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-5" />
          </button>
          <h1 className="text-lg font-bold text-foreground truncate min-w-0">보트 상세</h1>
          {isCancelled && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-destructive/15 text-destructive border border-destructive/30 font-semibold shrink-0">
              취소됨
            </span>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {loading && <div className="flex justify-center py-16"><Loader2 className="size-8 animate-spin text-chart-5" /></div>}
        {err && <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">{err}</div>}

        {!loading && !err && market && (
          <>
            {/* 기본 정보 */}
            <div className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-2">
              <h2 className="text-base font-bold leading-snug">{market.question}</h2>
              <p className="text-xs text-muted-foreground">
                {market.category}{market.subCategory ? ` · ${market.subCategory}` : ""}
                {" · "}마감 {new Date(market.endsAt).toLocaleString("ko-KR")}
                {market.createdAt && <> · 생성 {new Date(market.createdAt).toLocaleString("ko-KR")}</>}
                {market.resultAt && <> · 결과 {new Date(market.resultAt).toLocaleString("ko-KR")}</>}
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button variant="outline" size="sm" className="h-8 text-xs" asChild>
                  <Link href={`/market/${market.id}`}>유저 보트 페이지</Link>
                </Button>
                {/* 취소 버튼 */}
                {!isCancelled && (
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={cancelling}
                    onClick={() => void handleCancel()}
                  >
                    <AlertOctagon className="size-3 mr-1" />
                    {cancelling ? "취소 중…" : "보트 중지 + 전액 환불"}
                  </Button>
                )}
              </div>
              {cancelMsg && (
                <p className={cn("text-xs px-3 py-2 rounded-lg mt-1", cancelMsg.ok ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-500")}>
                  {cancelMsg.text}
                </p>
              )}
            </div>

            {/* 창작자 정보 */}
            {(market.creatorId || market.creatorNickname) && (
              <div className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-1">
                <div className="flex items-center gap-2 mb-2">
                  <User className="size-4 text-chart-5 shrink-0" />
                  <span className="text-sm font-semibold">보트 창작자</span>
                </div>
                <div className="flex flex-wrap gap-4 text-sm">
                  <div>
                    <span className="text-xs text-muted-foreground mr-1">닉네임</span>
                    <span className="font-medium">{market.creatorNickname ?? "—"}</span>
                  </div>
                  {market.creatorEmail && (
                    <div>
                      <span className="text-xs text-muted-foreground mr-1">이메일</span>
                      <span className="font-medium">{market.creatorEmail}</span>
                    </div>
                  )}
                  {market.creatorId && (
                    <div>
                      <span className="text-xs text-muted-foreground mr-1">UUID</span>
                      <code className="text-xs font-mono">{market.creatorId.slice(0, 12)}…</code>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 창작자 제재 패널 */}
            {market.creatorId && !market.isOfficial && (
              <UserModerationPanel
                userId={market.creatorId}
                displayName={market.creatorNickname ?? market.creatorId.slice(0, 8)}
                onActionDone={() => setReloadNonce((n) => n + 1)}
              />
            )}

            {/* 결과 확정 */}
            {!betFinalized && market.options && market.options.length > 0 && (
              <div className="rounded-xl border border-chart-5/30 bg-card p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Trophy className="size-5 text-chart-5 shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-foreground">결과 확정 (운영자)</p>
                    <p className="text-xs text-muted-foreground">확정 후에는 되돌릴 수 없습니다.</p>
                  </div>
                </div>
                {settleErr && <p className="text-sm text-destructive rounded-md bg-destructive/10 px-3 py-2">{settleErr}</p>}
                <div className={cn("grid gap-2", market.options.length === 2 ? "grid-cols-2" : market.options.length === 3 ? "grid-cols-3" : "grid-cols-2")}>
                  {market.options.map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={settling}
                      onClick={() => void confirmSettle(opt.id, opt.label)}
                      className="rounded-xl border-2 px-3 py-3 text-sm font-semibold transition-all hover:opacity-95 disabled:opacity-50"
                      style={{
                        borderColor: `color-mix(in oklch, ${opt.color} 40%, transparent)`,
                        background: `color-mix(in oklch, ${opt.color} 10%, transparent)`,
                        color: opt.color,
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {betFinalized && (
              <div className="rounded-lg border border-border/60 bg-secondary/20 px-3 py-2 text-sm text-muted-foreground">
                {isCancelled ? "보트가 취소되었습니다." : "결과 확정됨"}
                {market.winningOptionId && !isCancelled && (
                  <> · 결과 옵션 ID <code className="text-xs">{market.winningOptionId.slice(0, 12)}…</code></>
                )}
              </div>
            )}

            {/* 통계 */}
            {stats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="베팅 건수" value={String(stats.betCount)} />
                <Stat label="총 베팅액(P)" value={stats.totalAmount.toLocaleString()} />
                <Stat label="참여자(추정)" value={String(stats.uniqueBettors)} />
                <Stat label="선택지별 합계" value={`${Object.keys(stats.optionTotals).length}개 키`} />
              </div>
            )}

            {/* bet_history 로그 */}
            <div className="rounded-xl border border-border/60 overflow-hidden">
              <p className="text-sm font-semibold px-3 py-2 bg-secondary/40 border-b border-border/60">
                bet_history ({history.length}행)
              </p>
              <div className="overflow-x-auto max-h-[min(60vh,480px)] overflow-y-auto">
                <table className="w-full text-xs font-mono">
                  <thead>
                    <tr className="border-b border-border/60 text-left bg-secondary/20">
                      <th className="px-2 py-1.5">#</th>
                      <th className="px-2 py-1.5">raw (JSON)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.length === 0 ? (
                      <tr><td colSpan={2} className="px-3 py-6 text-center text-muted-foreground">내역 없음</td></tr>
                    ) : (
                      history.slice(0, 200).map((row, i) => (
                        <tr key={i} className="border-b border-border/30 align-top">
                          <td className="px-2 py-1 text-muted-foreground whitespace-nowrap">{i + 1}</td>
                          <td className="px-2 py-1 break-all whitespace-pre-wrap">{JSON.stringify(row)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/50 bg-secondary/20 px-3 py-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-sm font-bold tabular-nums">{value}</p>
    </div>
  );
}
