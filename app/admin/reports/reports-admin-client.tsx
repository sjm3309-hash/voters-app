"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Flag,
  Loader2,
  RefreshCw,
  Trash2,
  XCircle,
} from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useUserPointsBalance } from "@/lib/points";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { cn } from "@/lib/utils";
import { REPORT_REASONS } from "@/lib/reports-config";
import type { ReportTargetType } from "@/lib/reports-config";

type ReportRow = {
  id: string;
  reporter_id: string | null;
  target_type: ReportTargetType;
  target_id: string;
  reason: string;
  detail: string | null;
  status: "pending" | "reviewed" | "dismissed";
  admin_note: string | null;
  created_at: string;
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleString("ko-KR", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

const TARGET_LABEL: Record<ReportTargetType, string> = {
  boat:          "🚢 보트",
  boat_comment:  "💬 보트댓글",
  board_post:    "📄 게시글",
  board_comment: "🗨 게시글댓글",
};

const STATUS_LABEL = {
  pending:   { label: "미처리",   cls: "text-amber-500 border-amber-500/30 bg-amber-500/10" },
  reviewed:  { label: "처리완료", cls: "text-green-500 border-green-500/30 bg-green-500/10" },
  dismissed: { label: "기각",     cls: "text-muted-foreground border-border/50 bg-secondary/30" },
};

const TARGET_LINK: Record<ReportTargetType, (id: string) => string> = {
  boat:          (id) => `/market/${id}`,
  boat_comment:  ()   => "#",
  board_post:    (id) => `/board/${id}`,
  board_comment: ()   => "#",
};

function ReasonLabel({ reason }: { reason: string }) {
  const found = REPORT_REASONS.find((r) => r.id === reason);
  return <span>{found ? found.label : reason}</span>;
}

function ReportCard({
  report,
  onStatusChange,
  onDelete,
}: {
  report: ReportRow;
  onStatusChange: (id: string, status: ReportRow["status"]) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleStatus = async (status: ReportRow["status"]) => {
    setLoading(true);
    await onStatusChange(report.id, status);
    setLoading(false);
  };

  const link = TARGET_LINK[report.target_type]?.(report.target_id);

  return (
    <div className={cn(
      "rounded-xl border bg-card/60 transition-all",
      report.status === "pending" ? "border-amber-500/25" : "border-border/50",
    )}>
      <button
        type="button"
        className="w-full text-left px-4 py-3 flex items-start gap-3"
        onClick={() => setExpanded((v) => !v)}
      >
        <Flag className={cn("size-4 mt-0.5 shrink-0", report.status === "pending" ? "text-amber-500" : "text-muted-foreground")} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 mb-0.5">
            <span className="text-xs font-semibold px-1.5 py-0.5 rounded border bg-secondary/30 text-muted-foreground">
              {TARGET_LABEL[report.target_type]}
            </span>
            <ReasonLabel reason={report.reason} />
            <span className={cn("text-[11px] font-semibold px-2 py-0.5 rounded-full border", STATUS_LABEL[report.status].cls)}>
              {STATUS_LABEL[report.status].label}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">{formatTime(report.created_at)}</p>
        </div>
        <div className="shrink-0 text-muted-foreground">
          {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-border/40 pt-3 space-y-3">
          <div className="text-xs text-muted-foreground space-y-1">
            <div>
              <span className="font-semibold">대상 ID: </span>
              <code className="text-[11px] bg-secondary/30 px-1 rounded">{report.target_id}</code>
              {link !== "#" && (
                <a href={link} target="_blank" rel="noreferrer" className="ml-2 text-chart-5 hover:underline inline-flex items-center gap-0.5">
                  <ExternalLink className="size-3" /> 바로가기
                </a>
              )}
            </div>
            {report.detail && (
              <div>
                <span className="font-semibold">추가 내용: </span>
                <span className="text-foreground">{report.detail}</span>
              </div>
            )}
            {report.admin_note && (
              <div className="rounded-lg border border-chart-5/25 bg-chart-5/5 p-2">
                <span className="font-semibold text-chart-5">운영자 메모: </span>
                <span className="text-foreground">{report.admin_note}</span>
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={loading || report.status === "reviewed"}
              onClick={() => handleStatus("reviewed")}
              className="gap-1.5 text-green-600 border-green-500/30 hover:bg-green-500/10"
            >
              <CheckCircle2 className="size-3.5" />
              처리완료
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={loading || report.status === "dismissed"}
              onClick={() => handleStatus("dismissed")}
              className="gap-1.5 text-muted-foreground"
            >
              <XCircle className="size-3.5" />
              기각
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={loading || report.status === "pending"}
              onClick={() => handleStatus("pending")}
              className="gap-1.5 text-amber-500 border-amber-500/30 hover:bg-amber-500/10"
            >
              미처리로
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={loading}
              onClick={() => onDelete(report.id)}
              className="ml-auto text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="size-3.5" />
              삭제
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

export function ReportsAdminClient() {
  const router = useRouter();
  const { userId, points: balance } = useUserPointsBalance();
  const { isAdmin, loading: adminLoading } = useIsAdmin();

  const [statusFilter, setStatusFilter] = useState<"all" | ReportRow["status"]>("pending");
  const [typeFilter, setTypeFilter] = useState<"all" | ReportTargetType>("all");
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p = 1) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (typeFilter !== "all") params.set("targetType", typeFilter);
      params.set("page", String(p));
      const res = await fetch(`/api/admin/reports?${params}`, { credentials: "same-origin" });
      const json = await res.json();
      if (!json.ok) throw new Error(json.error ?? "불러오기 실패");
      setReports(json.reports);
      setTotal(json.total);
      setPage(p);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [statusFilter, typeFilter]);

  useEffect(() => {
    if (!adminLoading && isAdmin) void load(1);
  }, [load, adminLoading, isAdmin]);

  useEffect(() => {
    if (!adminLoading && !isAdmin) router.replace("/");
  }, [adminLoading, isAdmin, router]);

  const handleStatusChange = async (id: string, status: ReportRow["status"]) => {
    const res = await fetch("/api/admin/reports", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
    const json = await res.json();
    if (json.ok) setReports((prev) => prev.map((r) => r.id === id ? json.report : r));
  };

  const handleDelete = async (id: string) => {
    if (!confirm("이 신고를 삭제하시겠습니까?")) return;
    const res = await fetch(`/api/admin/reports?id=${id}`, { method: "DELETE" });
    const json = await res.json();
    if (json.ok) {
      setReports((prev) => prev.filter((r) => r.id !== id));
      setTotal((n) => n - 1);
    }
  };

  const pendingCount = reports.filter((r) => r.status === "pending").length;

  if (adminLoading || !isAdmin) return null;

  const PAGE_SIZE = 30;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="min-h-screen bg-background">
      <Navbar balance={balance} userId={userId} />

      <div className="border-b border-border/50 bg-background/80 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 py-3 flex flex-wrap items-center gap-3">
          <button type="button" onClick={() => router.push("/admin")} className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-5" />
          </button>
          <Flag className="size-5 text-red-400" />
          <h1 className="text-lg font-bold text-foreground">신고 관리</h1>
          {pendingCount > 0 && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 border border-amber-500/30 font-bold">
              미처리 {pendingCount}건
            </span>
          )}
          <Button variant="ghost" size="sm" className="ml-auto gap-1.5 text-xs text-muted-foreground" onClick={() => load(page)}>
            <RefreshCw className="size-3.5" />새로고침
          </Button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-4">
        {/* 필터 */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex gap-1.5">
            {(["all", "pending", "reviewed", "dismissed"] as const).map((s) => (
              <button key={s} type="button"
                onClick={() => { setStatusFilter(s); setPage(1); }}
                className={cn("text-xs px-2.5 py-1 rounded-full border font-medium transition-colors",
                  statusFilter === s ? "bg-chart-5/15 text-chart-5 border-chart-5/30" : "bg-secondary/20 text-muted-foreground border-border/50 hover:bg-secondary/40"
                )}
              >
                {s === "all" ? "전체" : STATUS_LABEL[s]?.label}
              </button>
            ))}
          </div>

          <Tabs value={typeFilter} onValueChange={(v) => { setTypeFilter(v as typeof typeFilter); setPage(1); }}>
            <TabsList className="h-8">
              <TabsTrigger value="all" className="text-xs px-2">전체</TabsTrigger>
              <TabsTrigger value="boat" className="text-xs px-2">보트</TabsTrigger>
              <TabsTrigger value="boat_comment" className="text-xs px-2">보트댓글</TabsTrigger>
              <TabsTrigger value="board_post" className="text-xs px-2">게시글</TabsTrigger>
              <TabsTrigger value="board_comment" className="text-xs px-2">게시글댓글</TabsTrigger>
            </TabsList>
          </Tabs>

          <span className="text-xs text-muted-foreground ml-auto">총 {total}건</span>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-2.5">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />불러오는 중...
          </div>
        ) : reports.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground text-sm">해당하는 신고가 없습니다.</div>
        ) : (
          <div className="space-y-2">
            {reports.map((r) => (
              <ReportCard key={r.id} report={r} onStatusChange={handleStatusChange} onDelete={handleDelete} />
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1 || loading} onClick={() => load(page - 1)}>이전</Button>
            <span className="text-sm text-muted-foreground">{page} / {totalPages}</span>
            <Button size="sm" variant="outline" disabled={page >= totalPages || loading} onClick={() => load(page + 1)}>다음</Button>
          </div>
        )}
      </div>
    </div>
  );
}
