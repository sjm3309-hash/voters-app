"use client";

import { useEffect, useState } from "react";
import { Coins, Loader2, TrendingDown, TrendingUp } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import type { PebbleTx } from "@/app/api/admin/users/[id]/pebble-history/route";

const TYPE_LABEL: Record<string, string> = {
  admin_grant: "운영자 지급",
  admin_deduct: "운영자 차감",
  daily_reward: "일일 보상",
  level_up: "레벨업",
  bet_win: "보트 당첨",
  bet_place: "보트 참여",
  like_reward: "좋아요 보상",
  signup_bonus: "가입 보너스",
  welcome_bonus: "웰컴 보너스",
  creator_fee: "창작자 수수료",
  refund: "환불",
};

function labelForType(type: string) {
  return TYPE_LABEL[type] ?? type;
}

function TypeBadge({ type }: { type: string }) {
  const isPositive = type !== "admin_deduct" && type !== "bet_place" && type !== "level_up";
  return (
    <span
      className={cn(
        "inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold leading-none",
        isPositive
          ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
          : "bg-rose-500/10 text-rose-500 border border-rose-500/20",
      )}
    >
      {labelForType(type)}
    </span>
  );
}

export function PebbleHistoryDialog({
  displayName,
  userId,
  currentPebbles,
  open,
  onOpenChange,
}: {
  displayName: string;
  userId: string;
  currentPebbles: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [txs, setTxs] = useState<PebbleTx[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !userId) {
      setTxs([]);
      setError(null);
      return;
    }
    setLoading(true);
    setError(null);
    void fetch(`/api/admin/users/${encodeURIComponent(userId)}/pebble-history`, {
      credentials: "same-origin",
    })
      .then((r) => r.json())
      .then((j: { ok?: boolean; error?: string; transactions?: PebbleTx[] }) => {
        if (j.ok && Array.isArray(j.transactions)) {
          setTxs(j.transactions);
        } else {
          setError(j.error ?? "데이터를 불러오지 못했습니다.");
        }
      })
      .catch(() => setError("네트워크 오류가 발생했습니다."))
      .finally(() => setLoading(false));
  }, [open, userId]);

  const totalEarned = txs.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalSpent = txs.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton
        className="sm:max-w-xl max-h-[90vh] flex flex-col gap-0 overflow-hidden p-0"
      >
        <DialogHeader className="px-6 pt-6 pb-3 shrink-0 text-left border-b border-border/40">
          <DialogTitle className="flex items-center gap-2">
            <Coins className="size-5 text-chart-5" />
            {displayName}님의 페블 내역
          </DialogTitle>
          <DialogDescription className="text-xs">
            최근 200건까지 표시됩니다.
          </DialogDescription>
        </DialogHeader>

        {/* 요약 카드 */}
        <div className="px-6 py-3 shrink-0 grid grid-cols-3 gap-3 border-b border-border/40 bg-secondary/10">
          <div className="rounded-lg bg-card border border-border/50 px-3 py-2 text-center">
            <p className="text-[10px] text-muted-foreground mb-0.5">현재 보유</p>
            <p className="text-sm font-bold text-chart-5 tabular-nums">{currentPebbles.toLocaleString()} P</p>
          </div>
          <div className="rounded-lg bg-card border border-border/50 px-3 py-2 text-center">
            <p className="text-[10px] text-muted-foreground mb-0.5">총 획득</p>
            <p className="text-sm font-bold text-emerald-500 tabular-nums">+{totalEarned.toLocaleString()} P</p>
          </div>
          <div className="rounded-lg bg-card border border-border/50 px-3 py-2 text-center">
            <p className="text-[10px] text-muted-foreground mb-0.5">총 사용</p>
            <p className="text-sm font-bold text-rose-500 tabular-nums">-{totalSpent.toLocaleString()} P</p>
          </div>
        </div>

        <ScrollArea className="flex-1 min-h-0 px-6 pb-6 pt-3">
          {loading && (
            <div className="flex justify-center py-12">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          )}
          {!loading && error && (
            <p className="py-10 text-center text-sm text-destructive">{error}</p>
          )}
          {!loading && !error && txs.length === 0 && (
            <p className="py-10 text-center text-sm text-muted-foreground">페블 내역이 없습니다.</p>
          )}
          {!loading && !error && txs.length > 0 && (
            <div className="space-y-1.5">
              {txs.map((tx) => (
                <div
                  key={tx.id}
                  className="flex items-start gap-3 rounded-lg border border-border/40 bg-card px-3 py-2.5 hover:bg-secondary/20 transition-colors"
                >
                  {/* 아이콘 */}
                  <div className={cn(
                    "shrink-0 mt-0.5 rounded-full p-1",
                    tx.amount > 0 ? "bg-emerald-500/10" : "bg-rose-500/10",
                  )}>
                    {tx.amount > 0
                      ? <TrendingUp className="size-3 text-emerald-500" />
                      : <TrendingDown className="size-3 text-rose-500" />
                    }
                  </div>

                  {/* 내용 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <TypeBadge type={tx.type} />
                      {tx.description && (
                        <span className="text-[11px] text-muted-foreground truncate">{tx.description}</span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5 tabular-nums">
                      {new Date(tx.date).toLocaleString("ko-KR")}
                      <span className="ml-1.5">잔액 {tx.balance.toLocaleString()} P</span>
                    </p>
                  </div>

                  {/* 금액 */}
                  <span className={cn(
                    "shrink-0 text-sm font-bold tabular-nums",
                    tx.amount > 0 ? "text-emerald-500" : "text-rose-500",
                  )}>
                    {tx.amount > 0 ? "+" : ""}{tx.amount.toLocaleString()} P
                  </span>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
