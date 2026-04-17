"use client";

import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Gift, TrendingUp, Wallet } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { loadPointsHistory, loadUserPoints, type PointsTransaction } from "@/lib/points";

interface PointsHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  currentPoints: number;
}

function txIcon(type: PointsTransaction["type"]) {
  switch (type) {
    case "bonus":  return <Gift className="size-3.5 text-amber-400" />;
    case "vote":   return <ArrowUpRight className="size-3.5 text-red-400" />;
    case "refund": return <ArrowDownLeft className="size-3.5 text-blue-400" />;
    case "reward": return <TrendingUp className="size-3.5 text-green-400" />;
    default:       return <Wallet className="size-3.5 text-muted-foreground" />;
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

export function PointsHistoryDialog({
  open,
  onOpenChange,
  userId,
  currentPoints,
}: PointsHistoryDialogProps) {
  const [history, setHistory] = useState<PointsTransaction[]>([]);

  useEffect(() => {
    if (open && userId && userId !== "anon") {
      setHistory(loadPointsHistory(userId));
    }
  }, [open, userId]);

  const earned = history.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const spent  = history.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl border border-border/60 bg-card/90 backdrop-blur-2xl shadow-2xl p-0 overflow-hidden">
        <DialogHeader className="px-6 pt-5 pb-4 border-b border-border/40">
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Wallet className="size-4 text-chart-5" />
            페블 내역
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
                <span className="text-xs font-semibold text-green-400">+{earned.toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-1.5 justify-end">
                <ArrowUpRight className="size-3 text-red-400" />
                <span className="text-xs text-muted-foreground">사용</span>
                <span className="text-xs font-semibold text-red-400">-{spent.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>

        {/* 거래 내역 */}
        <div className="max-h-80 overflow-y-auto">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
              <Wallet className="size-8 opacity-30" />
              <p className="text-sm">페블 내역이 없습니다</p>
            </div>
          ) : (
            <ul className="divide-y divide-border/30">
              {history.map((tx) => (
                <li key={tx.id} className="flex items-center gap-3 px-6 py-3 hover:bg-secondary/30 transition-colors">
                  {/* 아이콘 */}
                  <div className="shrink-0 size-7 rounded-full bg-secondary/60 flex items-center justify-center">
                    {txIcon(tx.type)}
                  </div>

                  {/* 설명 + 시각 */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{tx.description}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(tx.date)}</p>
                  </div>

                  {/* 금액 + 잔액 */}
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
      </DialogContent>
    </Dialog>
  );
}
