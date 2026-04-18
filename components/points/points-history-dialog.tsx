"use client";

import { useEffect, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Gift,
  TrendingUp,
  Wallet,
  ShieldAlert,
  Loader2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { loadPointsHistory, type PointsTransaction } from "@/lib/points";
import type { DbTransaction } from "@/app/api/pebbles/history/route";

interface PointsHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  currentPoints: number;
}

// localStorage 타입 ↔ DB 타입 통합 표현
interface MergedTx {
  id: string;
  date: string;
  type: string;
  description: string;
  amount: number;
  balance: number;
}

function txIcon(type: string) {
  switch (type) {
    case "bonus":        return <Gift className="size-3.5 text-amber-400" />;
    case "vote":         return <ArrowUpRight className="size-3.5 text-red-400" />;
    case "refund":       return <ArrowDownLeft className="size-3.5 text-blue-400" />;
    case "reward":       return <TrendingUp className="size-3.5 text-green-400" />;
    case "admin_grant":  return <Gift className="size-3.5 text-chart-5" />;
    case "admin_deduct": return <ShieldAlert className="size-3.5 text-orange-500" />;
    default:             return <Wallet className="size-3.5 text-muted-foreground" />;
  }
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);

  if (mins < 1)   return "방금 전";
  if (mins < 60)  return `${mins}분 전`;
  if (hours < 24) return `${hours}시간 전`;
  if (days < 7)   return `${days}일 전`;
  return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
}

/** localStorage 내역을 MergedTx로 변환 */
function fromLocalStorage(userId: string): MergedTx[] {
  return loadPointsHistory(userId).map((t: PointsTransaction) => ({
    id: `local_${t.id}`,
    date: t.date,
    type: t.type,
    description: t.description,
    amount: t.amount,
    balance: t.balance,
  }));
}

/** DB 내역을 MergedTx로 변환 */
function fromDb(rows: DbTransaction[]): MergedTx[] {
  return rows.map((r) => ({
    id: `db_${r.id}`,
    date: r.date,
    type: r.type,
    description: r.description,
    amount: r.amount,
    balance: r.balance,
  }));
}

export function PointsHistoryDialog({
  open,
  onOpenChange,
  userId,
  currentPoints,
}: PointsHistoryDialogProps) {
  const [history, setHistory] = useState<MergedTx[]>([]);
  const [dbLoading, setDbLoading] = useState(false);

  useEffect(() => {
    if (!open || !userId || userId === "anon") return;

    // localStorage 내역 즉시 표시
    const local = fromLocalStorage(userId);
    setHistory(local);

    // DB 내역 비동기 병합
    setDbLoading(true);
    fetch("/api/pebbles/history", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; transactions?: DbTransaction[] }) => {
        if (!j.ok) return;
        const dbRows = fromDb(j.transactions ?? []);

        // 중복 제거: DB id 기반으로 덮어쓰고 localStorage 고유 항목 유지
        // DB 항목이 더 신뢰도 높으므로 DB 우선, 나머지 localStorage 보완
        const dbIds = new Set(dbRows.map((r) => r.id));
        const localOnly = local.filter((r) => {
          // DB에 admin_grant/admin_deduct 가 있으면 local에서 같은 유형 제거
          return true; // 날짜 기반 중복 제거는 안 하고 단순 합산 (DB가 공식 기록)
          void dbIds;
        });

        // DB 항목 + localStorage 항목 합산 후 날짜 내림차순 정렬
        const merged = [...dbRows, ...localOnly].sort(
          (a, b) => Date.parse(b.date) - Date.parse(a.date),
        );
        setHistory(merged);
      })
      .catch(() => { /* DB 실패 시 localStorage만 사용 */ })
      .finally(() => setDbLoading(false));
  }, [open, userId]);

  const earned = history.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const spent  = history.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl border border-border/60 bg-card/90 backdrop-blur-2xl shadow-2xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border/40">
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Wallet className="size-4 text-chart-5" />
            페블 내역
            {dbLoading && <Loader2 className="size-3.5 animate-spin text-muted-foreground ml-1" />}
          </DialogTitle>
        </DialogHeader>

        {/* 잔액 요약 */}
        <div className="px-6 py-4 bg-chart-5/5 border-b border-border/30">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs text-muted-foreground mb-1">현재 보유 페블</p>
              <p className="text-2xl font-bold text-chart-5">
                {currentPoints.toLocaleString()}
                <span className="text-sm font-normal text-muted-foreground ml-1">P</span>
              </p>
            </div>
            <div className="text-right space-y-1">
              <div className="flex items-center gap-1.5 justify-end">
                <ArrowDownLeft className="size-3 text-green-400" />
                <span className="text-xs text-muted-foreground">획득</span>
                <span className="text-xs font-semibold text-green-400">+{earned.toLocaleString()} P</span>
              </div>
              <div className="flex items-center gap-1.5 justify-end">
                <ArrowUpRight className="size-3 text-red-400" />
                <span className="text-xs text-muted-foreground">사용</span>
                <span className="text-xs font-semibold text-red-400">-{spent.toLocaleString()} P</span>
              </div>
            </div>
          </div>
        </div>

        {/* 거래 내역 */}
        <div className="max-h-80 overflow-y-auto">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
              <Wallet className="size-8 opacity-30" />
              <p className="text-sm">{dbLoading ? "불러오는 중…" : "페블 내역이 없습니다"}</p>
            </div>
          ) : (
            <ul className="divide-y divide-border/30">
              {history.map((tx) => (
                <li
                  key={tx.id}
                  className="flex items-center gap-3 px-6 py-3 hover:bg-secondary/30 transition-colors"
                >
                  <div className="shrink-0 size-7 rounded-full bg-secondary/60 flex items-center justify-center">
                    {txIcon(tx.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{tx.description}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(tx.date)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className={`text-sm font-bold ${tx.amount > 0 ? "text-green-400" : "text-red-400"}`}>
                      {tx.amount > 0 ? "+" : ""}{tx.amount.toLocaleString()} P
                    </p>
                    <p className="text-xs text-muted-foreground">{tx.balance.toLocaleString()} P</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 페블 적립 안내 */}
        <div className="px-6 py-3 border-t border-border/30 bg-secondary/20">
          <p className="text-[11px] text-muted-foreground text-center">
            게시글 작성·댓글·보트 참여 시 페블을 획득할 수 있어요
          </p>
        </div>

        {/* 면책 안내문 */}
        <div className="px-5 py-4 border-t border-border/40 bg-amber-500/5">
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            ⚠️ 본 사이트의 모든 <strong className="text-foreground">&#39;페블(포인트)&#39;</strong>은 사이트 내에서만 사용되는 가상 재화이며, 어떠한 경우에도 현금, 상품권, 혹은 실제 가치를 지닌 물품으로 교환(환전)될 수 없습니다. 본 사이트는 사행성을 조장하지 않는 순수 통계 및 커뮤니티 목적의 플랫폼입니다.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
