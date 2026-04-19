"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  Coins,
  Flag,
  Headphones,
  LayoutDashboard,
  Loader2,
  RefreshCw,
  Settings2,
  TrendingUp,
  Users,
} from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useUserPointsBalance } from "@/lib/points";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { cn } from "@/lib/utils";

type DbSummary = {
  profileRowCount: number;
  totalPebblesInProfiles: number;
};

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  sub?: string;
  accent?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border p-4 space-y-1",
        accent ? "border-chart-5/30 bg-chart-5/5" : "border-border/60 bg-card/60",
      )}
    >
      <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
        <Icon className={cn("size-3.5", accent ? "text-chart-5" : "")} />
        <span>{label}</span>
      </div>
      <p className={cn("text-2xl font-bold", accent ? "text-chart-5" : "text-foreground")}>
        {value}
      </p>
      {sub && <p className="text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}

type GrantAllResult = {
  succeeded: number;
  skippedAdmin: number;
  failed: number;
  amount: number;
  reason: string;
};

export function AdminClient() {
  const router = useRouter();
  const { userId, points: balance } = useUserPointsBalance();
  const { isAdmin, loading } = useIsAdmin();

  const [stats, setStats] = useState<DbSummary | null>(null);
  const [refreshed, setRefreshed] = useState(0);

  // 전체 유저 페블 지급
  const [grantAmount, setGrantAmount] = useState("");
  const [grantReason, setGrantReason] = useState("");
  const [grantLoading, setGrantLoading] = useState(false);
  const [grantResult, setGrantResult] = useState<GrantAllResult | null>(null);
  const [grantError, setGrantError] = useState<string | null>(null);

  const handleGrantAll = async () => {
    const n = parseInt(grantAmount, 10);
    if (!n || n <= 0) {
      setGrantError("유효한 페블 수를 입력하세요 (1 이상의 정수)");
      return;
    }
    if (!window.confirm(
      `전체 유저에게 ${n.toLocaleString()} P 를 지급합니다.\n사유: ${grantReason || "운영자 일괄 지급"}\n\n계속할까요?`
    )) return;

    setGrantLoading(true);
    setGrantResult(null);
    setGrantError(null);
    try {
      const res = await fetch("/api/admin/pebbles/grant-all", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ amount: n, reason: grantReason || "운영자 일괄 지급" }),
      });
      const j = (await res.json()) as {
        ok?: boolean;
        error?: string;
        succeeded?: number;
        skippedAdmin?: number;
        failed?: number;
        amount?: number;
        reason?: string;
      };
      if (res.ok && j.ok) {
        setGrantResult({
          succeeded: j.succeeded ?? 0,
          skippedAdmin: j.skippedAdmin ?? 0,
          failed: j.failed ?? 0,
          amount: j.amount ?? n,
          reason: j.reason ?? "",
        });
        setGrantAmount("");
        setGrantReason("");
        setRefreshed((v) => v + 1);
      } else {
        setGrantError(j.error ?? "지급 실패");
      }
    } catch {
      setGrantError("네트워크 오류가 발생했습니다");
    } finally {
      setGrantLoading(false);
    }
  };

  const load = async () => {
    try {
      const res = await fetch("/api/admin/stats/summary", { credentials: "same-origin" });
      const j = (await res.json()) as {
        ok?: boolean;
        profileRowCount?: number;
        totalPebblesInProfiles?: number;
      };
      if (res.ok && j.ok && typeof j.profileRowCount === "number") {
        setStats({
          profileRowCount: j.profileRowCount,
          totalPebblesInProfiles: j.totalPebblesInProfiles ?? 0,
        });
      } else {
        setStats(null);
      }
    } catch {
      setStats(null);
    }
  };

  useEffect(() => {
    void load();
  }, [refreshed]);

  useEffect(() => {
    if (!loading && !isAdmin) router.replace("/");
  }, [loading, isAdmin, router]);

  if (loading || !isAdmin) return null;

  const avgPebbles =
    stats && stats.profileRowCount > 0
      ? Math.round(stats.totalPebblesInProfiles / stats.profileRowCount)
      : 0;

  return (
    <div className="min-h-screen bg-background">
      <Navbar balance={balance} userId={userId} />

      <div className="border-b border-border/50 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => router.push("/")}
            className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-5" />
          </button>
          <Settings2 className="size-5 text-chart-5" />
          <h1 className="text-lg font-bold text-foreground">관리 페이지</h1>
          <span className="text-xs px-2 py-0.5 rounded-full bg-chart-5/15 text-chart-5 border border-chart-5/30 font-semibold ml-1">
            운영자 전용
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" asChild>
              <Link href="/admin/users">
                <Users className="size-3.5" />
                유저 목록 (DB)
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" asChild>
              <Link href="/admin/betting">
                <LayoutDashboard className="size-3.5" />
                보트 상세 통계
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" asChild>
              <Link href="/admin/customer-center">
                <Headphones className="size-3.5" />
                고객센터 관리
              </Link>
            </Button>
            <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" asChild>
              <Link href="/admin/reports">
                <Flag className="size-3.5" />
                신고 관리
              </Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1.5 text-xs text-muted-foreground"
              onClick={() => setRefreshed((n) => n + 1)}
            >
              <RefreshCw className="size-3.5" />
              새로고침
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-8">
        {stats && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <TrendingUp className="size-4 text-chart-5" />
              <h2 className="font-bold text-foreground">페블 통계 (DB)</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              <code className="text-[11px]">public.profiles</code> 테이블 기준 합계입니다.
            </p>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              <StatCard
                icon={Users}
                label="프로필 행 수"
                value={`${stats.profileRowCount.toLocaleString()}개`}
                sub="auth.users 와 1:1 목표"
              />
              <StatCard
                icon={Coins}
                label="프로필 페블 합계"
                value={`${stats.totalPebblesInProfiles.toLocaleString()} P`}
                accent
              />
              <StatCard
                icon={Coins}
                label="프로필당 평균 페블"
                value={`${avgPebbles.toLocaleString()} P`}
                sub="합계 ÷ 행 수"
              />
            </div>
          </section>
        )}

        <section className="rounded-xl border border-chart-5/25 bg-chart-5/5 p-4 space-y-2">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Users className="size-4 text-chart-5" />
            유저 목록
          </h2>
          <p className="text-sm text-muted-foreground">
            전체 회원은 Supabase <code className="text-xs">auth.users</code> 와{" "}
            <code className="text-xs">public.profiles</code> 를 조인해 표시합니다. 개별 페블 지급 · 검색은 목록 화면에서
            처리합니다.
          </p>
          <Button asChild className="mt-1" style={{ background: "var(--chart-5)", color: "white" }}>
            <Link href="/admin/users">유저 목록 열기</Link>
          </Button>
        </section>

        <section className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-4 space-y-2">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Headphones className="size-4 text-amber-500" />
            고객센터 관리
          </h2>
          <p className="text-sm text-muted-foreground">
            유저가 남긴 1:1 문의와 보트 아이디어 제안을 확인하고 답변을 남길 수 있습니다.
            미답변 문의가 있으면 상단에 카운트가 표시됩니다.
          </p>
          <Button asChild className="mt-1 bg-amber-500 hover:bg-amber-600 text-white border-0">
            <Link href="/admin/customer-center">고객센터 관리 열기</Link>
          </Button>
        </section>

        <section className="rounded-xl border border-red-500/25 bg-red-500/5 p-4 space-y-2">
          <h2 className="text-sm font-bold text-foreground flex items-center gap-2">
            <Flag className="size-4 text-red-400" />
            신고 관리
          </h2>
          <p className="text-sm text-muted-foreground">
            유저가 보트, 댓글, 게시글에 남긴 신고를 확인하고 처리 상태를 관리합니다.
          </p>
          <Button asChild className="mt-1 bg-red-500 hover:bg-red-600 text-white border-0">
            <Link href="/admin/reports">신고 관리 열기</Link>
          </Button>
        </section>

        {/* 전체 유저 페블 일괄 지급 */}
        <section className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-5 space-y-4">
          <div className="flex items-center gap-2">
            <Coins className="size-4 text-emerald-500" />
            <h2 className="text-sm font-bold text-foreground">전체 유저 페블 일괄 지급</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            운영자 계정을 제외한 모든 유저에게 동일한 페블을 지급합니다.
            지급 후 각 유저에게 알림이 발송되고 페블 내역에 기록됩니다.
          </p>

          <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-end">
            <div className="space-y-1 w-full sm:w-36">
              <label className="text-xs text-muted-foreground font-medium">지급 페블 (P)</label>
              <Input
                type="number"
                min={1}
                placeholder="예: 1000"
                value={grantAmount}
                onChange={(e) => { setGrantAmount(e.target.value); setGrantError(null); setGrantResult(null); }}
                disabled={grantLoading}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1 flex-1 w-full">
              <label className="text-xs text-muted-foreground font-medium">사유</label>
              <Input
                type="text"
                maxLength={100}
                placeholder="예: 서버 점검 보상"
                value={grantReason}
                onChange={(e) => { setGrantReason(e.target.value); setGrantError(null); setGrantResult(null); }}
                disabled={grantLoading}
                className="h-8 text-sm"
              />
            </div>
            <Button
              onClick={handleGrantAll}
              disabled={grantLoading || !grantAmount}
              className="h-8 px-4 text-xs shrink-0 bg-emerald-500 hover:bg-emerald-600 text-white border-0 gap-1.5"
            >
              {grantLoading ? (
                <><Loader2 className="size-3.5 animate-spin" />지급 중...</>
              ) : (
                <>전체 지급</>
              )}
            </Button>
          </div>

          {grantError && (
            <p className="text-xs text-destructive font-medium">{grantError}</p>
          )}

          {grantResult && (
            <div className="flex items-start gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2.5">
              <Check className="size-4 text-emerald-500 shrink-0 mt-0.5" />
              <div className="text-xs space-y-0.5">
                <p className="font-semibold text-emerald-700 dark:text-emerald-300">
                  지급 완료 — {grantResult.amount.toLocaleString()} P · {grantResult.reason}
                </p>
                <p className="text-muted-foreground">
                  성공 {grantResult.succeeded}명 · 운영자 제외 {grantResult.skippedAdmin}명
                  {grantResult.failed > 0 && ` · 실패 ${grantResult.failed}명`}
                </p>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
