"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, LayoutDashboard, Loader2 } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useUserPointsBalance } from "@/lib/points";

type AdminMarketRow = {
  id: string;
  question: string;
  category: string;
  subCategory?: string;
  endsAt: string;
  createdAt?: string;
  resultAt?: string;
  isOfficial?: boolean;
};

export function BettingAdminClient() {
  const router = useRouter();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const { userId, points: balance } = useUserPointsBalance();
  const [markets, setMarkets] = useState<AdminMarketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (adminLoading) return;
    if (!isAdmin) {
      router.replace("/");
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch("/api/admin/bets?sort=created_desc", {
          credentials: "same-origin",
        });
        const json = (await res.json()) as {
          ok?: boolean;
          markets?: AdminMarketRow[];
          error?: string;
        };
        if (!res.ok || !json.ok) {
          throw new Error(json.error || res.statusText);
        }
        if (!cancelled) setMarkets(json.markets ?? []);
      } catch (e) {
        if (!cancelled)
          setErr(e instanceof Error ? e.message : "목록을 불러오지 못했습니다.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminLoading, isAdmin, router]);

  if (adminLoading || (!loading && !isAdmin)) return null;

  return (
    <div className="min-h-screen bg-background">
      <Navbar balance={balance} userId={userId} />
      <div className="border-b border-border/50 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/admin")}
            className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-5" />
          </button>
          <LayoutDashboard className="size-5 text-chart-5" />
          <h1 className="text-lg font-bold text-foreground">베팅 상세 통계</h1>
          <span className="text-xs px-2 py-0.5 rounded-full bg-chart-5/15 text-chart-5 border border-chart-5/30 font-semibold ml-1">
            운영자 전용
          </span>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6">
        <p className="text-sm text-muted-foreground mb-4">
          DB에 저장된 동기화 보트 전체입니다. 메인 피드(`/api/bets-feed`)와 달리 종료 후 오래된 보트도 표시합니다.
        </p>

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

        {!loading && !err && (
          <div className="rounded-xl border border-border/60 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border/60 bg-secondary/40 text-left">
                    <th className="px-3 py-2 font-semibold">제목</th>
                    <th className="px-3 py-2 font-semibold whitespace-nowrap">카테고리</th>
                    <th className="px-3 py-2 font-semibold whitespace-nowrap">마감</th>
                    <th className="px-3 py-2 w-24" />
                  </tr>
                </thead>
                <tbody>
                  {markets.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-3 py-8 text-center text-muted-foreground">
                        보트가 없습니다.
                      </td>
                    </tr>
                  ) : (
                    markets.map((m) => (
                      <tr
                        key={m.id}
                        className="border-b border-border/40 hover:bg-secondary/30 transition-colors"
                      >
                        <td className="px-3 py-2 max-w-md">
                          <span className="line-clamp-2 font-medium">{m.question}</span>
                          {m.isOfficial && (
                            <span className="ml-2 text-[10px] uppercase text-chart-5 font-bold">
                              공식
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                          {m.category}
                          {m.subCategory ? (
                            <span className="text-xs"> · {m.subCategory}</span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap tabular-nums text-muted-foreground">
                          {new Date(m.endsAt).toLocaleString("ko-KR")}
                        </td>
                        <td className="px-3 py-2">
                          <Button variant="outline" size="sm" className="h-7 text-xs" asChild>
                            <Link href={`/admin/betting/${m.id}`}>상세</Link>
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
