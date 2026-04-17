"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useUserPointsBalance } from "@/lib/points";

type DashboardJson = {
  ok?: boolean;
  error?: string;
  market?: {
    id: string;
    question: string;
    category: string;
    endsAt: string;
    createdAt?: string;
    resultAt?: string;
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

  useEffect(() => {
    if (adminLoading) return;
    if (!isAdmin) {
      router.replace("/");
      return;
    }
    if (!id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch(`/api/admin/bets/${encodeURIComponent(id)}/dashboard`, {
          credentials: "same-origin",
        });
        const json = (await res.json()) as DashboardJson;
        if (!res.ok || !json.ok) {
          throw new Error(json.error || res.statusText);
        }
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled)
          setErr(e instanceof Error ? e.message : "불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminLoading, isAdmin, id, router]);

  if (adminLoading || (!loading && !isAdmin)) return null;

  const market = data?.market;
  const stats = data?.stats;
  const history = data?.history ?? [];

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
          <h1 className="text-lg font-bold text-foreground truncate min-w-0">
            보트 상세
          </h1>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {loading && (
          <div className="flex justify-center py-16">
            <Loader2 className="size-8 animate-spin text-chart-5" />
          </div>
        )}

        {err && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {err}
          </div>
        )}

        {!loading && !err && market && (
          <>
            <div className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-2">
              <h2 className="text-base font-bold leading-snug">{market.question}</h2>
              <p className="text-xs text-muted-foreground">
                {market.category} · 마감 {new Date(market.endsAt).toLocaleString("ko-KR")}
                {market.createdAt && (
                  <> · 생성 {new Date(market.createdAt).toLocaleString("ko-KR")}</>
                )}
                {market.resultAt && (
                  <> · 결과 {new Date(market.resultAt).toLocaleString("ko-KR")}</>
                )}
              </p>
              <Button variant="outline" size="sm" className="mt-2 h-8 text-xs" asChild>
                <Link href={`/market/${market.id}`}>유저 보트 페이지</Link>
              </Button>
            </div>

            {stats && (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="베팅 건수" value={String(stats.betCount)} />
                <Stat label="총 베팅액(P)" value={stats.totalAmount.toLocaleString()} />
                <Stat label="참여자(추정)" value={String(stats.uniqueBettors)} />
                <Stat
                  label="선택지별 합계"
                  value={`${Object.keys(stats.optionTotals).length}개 키`}
                />
              </div>
            )}

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
                      <tr>
                        <td colSpan={2} className="px-3 py-6 text-center text-muted-foreground">
                          내역 없음
                        </td>
                      </tr>
                    ) : (
                      history.slice(0, 200).map((row, i) => (
                        <tr key={i} className="border-b border-border/30 align-top">
                          <td className="px-2 py-1 text-muted-foreground whitespace-nowrap">
                            {i + 1}
                          </td>
                          <td className="px-2 py-1 break-all whitespace-pre-wrap">
                            {JSON.stringify(row)}
                          </td>
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
