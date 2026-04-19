"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarCheck,
  Gift,
  Loader2,
  MessageSquare,
  PenLine,
  ShieldAlert,
  ThumbsUp,
  TrendingUp,
  Trophy,
  Wallet,
  Zap,
  Target,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { loadPointsHistory, type PointsTransaction } from "@/lib/points";
import type { DbTransaction } from "@/app/api/pebbles/history/route";
import { cn } from "@/lib/utils";

interface PointsHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  currentPoints: number;
}

interface MergedTx {
  id: string;
  date: string;
  type: string;
  description: string;
  amount: number;
  balance: number;
}

type TabKey = "all" | "earn" | "spend";

// ── 아이콘 ────────────────────────────────────────────────────────────────────

function txIcon(type: string, description = "") {
  const desc = description.toLowerCase();
  if (desc.includes("출석") || desc.includes("daily"))
    return <CalendarCheck className="size-3.5 text-sky-400" />;
  if (desc.includes("댓글"))
    return <MessageSquare className="size-3.5 text-blue-400" />;
  if (desc.includes("게시글") || desc.includes("작성"))
    return <PenLine className="size-3.5 text-violet-400" />;
  if (desc.includes("좋아요"))
    return <ThumbsUp className="size-3.5 text-pink-400" />;
  if (desc.includes("당첨") || desc.includes("수령") || desc.includes("bet_win"))
    return <Trophy className="size-3.5 text-amber-400" />;
  if (desc.includes("파산") || desc.includes("bankruptcy"))
    return <Zap className="size-3.5 text-yellow-400" />;
  if (desc.includes("보트 참여") || desc.includes("베팅"))
    return <Target className="size-3.5 text-orange-400" />;
  if (desc.includes("레벨"))
    return <TrendingUp className="size-3.5 text-chart-5" />;

  switch (type) {
    case "bonus":
    case "welcome":
    case "admin_grant":    return <Gift className="size-3.5 text-amber-400" />;
    case "bet_place":      return <Target className="size-3.5 text-orange-400" />;
    case "vote":
    case "spend":          return <ArrowUpRight className="size-3.5 text-red-400" />;
    case "refund":
    case "bet_refund":     return <ArrowDownLeft className="size-3.5 text-blue-400" />;
    case "daily_reward":   return <CalendarCheck className="size-3.5 text-sky-400" />;
    case "level_up":       return <TrendingUp className="size-3.5 text-chart-5" />;
    case "reward":
    case "bet_win":
    case "creator_fee":    return <Trophy className="size-3.5 text-green-400" />;
    case "admin_deduct":   return <ShieldAlert className="size-3.5 text-orange-500" />;
    default:               return <Wallet className="size-3.5 text-muted-foreground" />;
  }
}

// 타입별 한국어 라벨
function txLabel(type: string, description: string): string {
  if (description) return description;
  switch (type) {
    case "daily_reward": return "일일 출석 보상";
    case "bet_win":      return "보트 당첨 수령";
    case "bet_place":    return "보트 참여";
    case "level_up":     return "레벨업";
    case "creator_fee":  return "창작자 수수료";
    case "admin_grant":  return "운영자 지급";
    case "admin_deduct": return "운영자 차감";
    case "refund":       return "환불";
    case "reward":       return "페블 획득";
    case "spend":        return "페블 사용";
    default:             return type || "페블 변동";
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

// ── 메인 컴포넌트 ─────────────────────────────────────────────────────────────

export function PointsHistoryDialog({
  open,
  onOpenChange,
  userId,
  currentPoints,
}: PointsHistoryDialogProps) {
  const [history, setHistory] = useState<MergedTx[]>([]);
  const [dbLoading, setDbLoading] = useState(false);
  const [tab, setTab] = useState<TabKey>("all");

  useEffect(() => {
    if (!open || !userId || userId === "anon") return;

    const local = fromLocalStorage(userId);
    setHistory(local);

    setDbLoading(true);
    fetch("/api/pebbles/history", { credentials: "same-origin" })
      .then((r) => r.json())
      .then((j: { ok?: boolean; transactions?: DbTransaction[] }) => {
        if (!j.ok) return;
        const dbRows = fromDb(j.transactions ?? []);

        // DB에 있는 항목과 시간(±10초) + amount 동일한 localStorage 항목 중복 제거
        const localOnly = local.filter((loc) => {
          const locTime = Date.parse(loc.date);
          return !dbRows.some(
            (db) =>
              db.amount === loc.amount &&
              Math.abs(Date.parse(db.date) - locTime) < 10_000,
          );
        });

        const merged = [...dbRows, ...localOnly].sort(
          (a, b) => Date.parse(b.date) - Date.parse(a.date),
        );
        setHistory(merged);
      })
      .catch(() => { /* DB 실패 시 localStorage만 사용 */ })
      .finally(() => setDbLoading(false));
  }, [open, userId]);

  const earned = useMemo(
    () => history.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0),
    [history],
  );
  const spent = useMemo(
    () => history.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0),
    [history],
  );

  const filtered = useMemo(() => {
    if (tab === "earn")  return history.filter((t) => t.amount > 0);
    if (tab === "spend") return history.filter((t) => t.amount < 0);
    return history;
  }, [history, tab]);

  const earnCount  = history.filter((t) => t.amount > 0).length;
  const spendCount = history.filter((t) => t.amount < 0).length;

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "all",   label: "전체",  count: history.length },
    { key: "earn",  label: "획득",  count: earnCount },
    { key: "spend", label: "사용",  count: spendCount },
  ];

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
        <div className="px-5 py-4 bg-chart-5/5 border-b border-border/30">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-[11px] text-muted-foreground mb-0.5">현재 보유</p>
              <p className="text-2xl font-bold text-chart-5 tabular-nums">
                {currentPoints.toLocaleString()}
                <span className="text-sm font-normal text-muted-foreground ml-1">P</span>
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
              <div className="flex items-center gap-1 mb-0.5">
                <ArrowDownLeft className="size-3 text-emerald-400" />
                <span className="text-[11px] text-muted-foreground">총 획득</span>
              </div>
              <p className="text-sm font-bold text-emerald-400 tabular-nums">+{earned.toLocaleString()} P</p>
            </div>
            <div className="rounded-lg bg-rose-500/10 border border-rose-500/20 px-3 py-2">
              <div className="flex items-center gap-1 mb-0.5">
                <ArrowUpRight className="size-3 text-rose-400" />
                <span className="text-[11px] text-muted-foreground">총 사용</span>
              </div>
              <p className="text-sm font-bold text-rose-400 tabular-nums">-{spent.toLocaleString()} P</p>
            </div>
          </div>
        </div>

        {/* 탭 */}
        <div className="flex border-b border-border/40 bg-secondary/10">
          {tabs.map(({ key, label, count }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={cn(
                "flex-1 py-2.5 text-xs font-semibold transition-colors relative",
                tab === key
                  ? "text-chart-5"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
              {count > 0 && (
                <span className={cn(
                  "ml-1 text-[10px] px-1 rounded-full tabular-nums",
                  tab === key
                    ? "bg-chart-5/20 text-chart-5"
                    : "bg-secondary text-muted-foreground",
                )}>
                  {count}
                </span>
              )}
              {tab === key && (
                <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-chart-5 rounded-t-full" />
              )}
            </button>
          ))}
        </div>

        {/* 거래 목록 */}
        <div className="max-h-72 overflow-y-auto">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-2 text-muted-foreground">
              <Wallet className="size-7 opacity-25" />
              <p className="text-sm">
                {dbLoading
                  ? "불러오는 중…"
                  : tab === "earn"
                    ? "획득 내역이 없습니다"
                    : tab === "spend"
                      ? "사용 내역이 없습니다"
                      : "페블 내역이 없습니다"}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-border/20">
              {filtered.map((tx) => {
                const isEarn = tx.amount > 0;
                return (
                  <li
                    key={tx.id}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-secondary/20 transition-colors"
                  >
                    {/* 아이콘 */}
                    <div className={cn(
                      "shrink-0 size-7 rounded-full flex items-center justify-center",
                      isEarn ? "bg-emerald-500/10" : "bg-rose-500/10",
                    )}>
                      {txIcon(tx.type, tx.description)}
                    </div>

                    {/* 설명 + 날짜 */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate leading-snug">
                        {txLabel(tx.type, tx.description)}
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">{formatDate(tx.date)}</p>
                    </div>

                    {/* 금액 + 잔액 */}
                    <div className="shrink-0 text-right">
                      <p className={cn(
                        "text-sm font-bold tabular-nums",
                        isEarn ? "text-emerald-400" : "text-rose-400",
                      )}>
                        {isEarn ? "+" : ""}{tx.amount.toLocaleString()} P
                      </p>
                      <p className="text-[11px] text-muted-foreground tabular-nums">
                        {tx.balance.toLocaleString()} P
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* 하단 면책 */}
        <div className="px-5 py-3 border-t border-border/30 bg-secondary/10">
          <p className="text-[10px] text-muted-foreground leading-relaxed text-center">
            ⚠️ 페블은 사이트 내 가상 재화로, 현금·상품권 등 실제 가치와 교환될 수 없습니다.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
