"use client";

import { useEffect, useState } from "react";
import { Ban, Clock, Coins, ShieldOff, ShieldCheck, Loader2, AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ModerationRecord = {
  user_id: string;
  is_banned: boolean;
  ban_reason: string | null;
  banned_at: string | null;
  suspended_until: string | null;
  suspend_reason: string | null;
};

async function fetchModeration(userId: string): Promise<ModerationRecord | null> {
  const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/moderation`, {
    credentials: "same-origin",
  });
  const j = (await res.json().catch(() => ({}))) as { ok?: boolean; moderation?: ModerationRecord | null };
  return j.ok ? (j.moderation ?? null) : null;
}

async function postModeration(userId: string, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string; newBalance?: number }> {
  const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/moderation`, {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json().catch(() => ({ ok: false, error: "응답 오류" })) as Promise<{ ok: boolean; error?: string; newBalance?: number }>;
}

interface Props {
  userId: string;
  displayName: string;
  currentPebbles?: number;
  onActionDone?: () => void;
}

export function UserModerationPanel({ userId, displayName, currentPebbles, onActionDone }: Props) {
  const [mod, setMod] = useState<ModerationRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [suspendDays, setSuspendDays] = useState("7");
  const [deductAmount, setDeductAmount] = useState("");
  const [deductReason, setDeductReason] = useState("");
  const [banReason, setBanReason] = useState("");

  const reload = async () => {
    setLoading(true);
    const data = await fetchModeration(userId).catch(() => null);
    setMod(data);
    setLoading(false);
  };

  useEffect(() => { void reload(); }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (body: Record<string, unknown>, successMsg: string) => {
    setBusy(true);
    setMsg(null);
    const r = await postModeration(userId, body);
    if (r.ok) {
      setMsg({ ok: true, text: successMsg + (r.newBalance !== undefined ? ` (잔액: ${r.newBalance.toLocaleString()} P)` : "") });
      await reload();
      onActionDone?.();
    } else {
      setMsg({ ok: false, text: r.error ?? "오류가 발생했습니다." });
    }
    setBusy(false);
  };

  const isSuspended = mod?.suspended_until
    ? Date.parse(mod.suspended_until) > Date.now()
    : false;

  return (
    <div className="rounded-xl border border-border/60 bg-card/60 p-4 space-y-4">
      <div className="flex items-center gap-2">
        <AlertTriangle className="size-4 text-amber-500 shrink-0" />
        <span className="text-sm font-semibold">유저 제재 — <span className="text-chart-5">{displayName}</span></span>
        {loading && <Loader2 className="size-3.5 animate-spin text-muted-foreground ml-auto" />}
      </div>

      {/* 현재 상태 */}
      {!loading && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-medium",
            mod?.is_banned
              ? "bg-red-500/15 text-red-500 border-red-500/30"
              : "bg-secondary/50 text-muted-foreground border-border/40",
          )}>
            <Ban className="size-3" />
            {mod?.is_banned ? "차단됨" : "차단 없음"}
          </span>
          <span className={cn(
            "inline-flex items-center gap-1 px-2 py-0.5 rounded-full border font-medium",
            isSuspended
              ? "bg-amber-500/15 text-amber-500 border-amber-500/30"
              : "bg-secondary/50 text-muted-foreground border-border/40",
          )}>
            <Clock className="size-3" />
            {isSuspended
              ? `${new Date(mod!.suspended_until!).toLocaleDateString("ko-KR")}까지 정지`
              : "정지 없음"}
          </span>
          {currentPebbles !== undefined && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border bg-secondary/50 text-muted-foreground border-border/40">
              <Coins className="size-3" />
              {currentPebbles.toLocaleString()} P 보유
            </span>
          )}
        </div>
      )}

      {msg && (
        <p className={cn(
          "text-xs px-3 py-2 rounded-lg",
          msg.ok ? "bg-emerald-500/10 text-emerald-600" : "bg-red-500/10 text-red-500",
        )}>
          {msg.text}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {/* 차단 / 차단 해제 */}
        <div className="space-y-2 rounded-lg border border-border/40 bg-secondary/10 p-3">
          <p className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
            <Ban className="size-3.5 text-red-500" /> 계정 차단
          </p>
          {!mod?.is_banned ? (
            <>
              <Input
                placeholder="차단 사유 (선택)"
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
                className="h-7 text-xs"
              />
              <Button
                size="sm"
                variant="destructive"
                className="h-7 text-xs w-full"
                disabled={busy}
                onClick={() => void act({ action: "ban", reason: banReason || undefined }, "차단 완료")}
              >
                <Ban className="size-3 mr-1" /> 차단하기
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs w-full"
              disabled={busy}
              onClick={() => void act({ action: "unban" }, "차단 해제 완료")}
            >
              <ShieldCheck className="size-3 mr-1" /> 차단 해제
            </Button>
          )}
        </div>

        {/* 기간 활동 정지 */}
        <div className="space-y-2 rounded-lg border border-border/40 bg-secondary/10 p-3">
          <p className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
            <Clock className="size-3.5 text-amber-500" /> 기간 활동 정지
          </p>
          {!isSuspended ? (
            <div className="flex gap-1.5">
              <Input
                type="number"
                placeholder="일수"
                value={suspendDays}
                onChange={(e) => setSuspendDays(e.target.value)}
                className="h-7 text-xs w-16 shrink-0"
                min={1}
              />
              <Button
                size="sm"
                className="h-7 text-xs flex-1 bg-amber-500 hover:bg-amber-600 text-white"
                disabled={busy}
                onClick={() => void act({ action: "suspend", days: Number(suspendDays) }, `${suspendDays}일 정지 완료`)}
              >
                <ShieldOff className="size-3 mr-1" /> 정지
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs w-full"
              disabled={busy}
              onClick={() => void act({ action: "unsuspend" }, "정지 해제 완료")}
            >
              <ShieldCheck className="size-3 mr-1" /> 정지 해제
            </Button>
          )}
        </div>

        {/* 페블 차감 */}
        <div className="space-y-2 rounded-lg border border-border/40 bg-secondary/10 p-3 sm:col-span-2">
          <p className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
            <Coins className="size-3.5 text-orange-500" /> 보유 포인트 차감
          </p>
          <div className="flex flex-wrap gap-1.5">
            <Input
              type="number"
              placeholder="차감 수량"
              value={deductAmount}
              onChange={(e) => setDeductAmount(e.target.value)}
              className="h-7 text-xs w-28 shrink-0"
              min={1}
            />
            <Input
              placeholder="차감 사유 (선택)"
              value={deductReason}
              onChange={(e) => setDeductReason(e.target.value)}
              className="h-7 text-xs flex-1 min-w-[100px]"
            />
            <Button
              size="sm"
              className="h-7 text-xs bg-orange-500 hover:bg-orange-600 text-white shrink-0"
              disabled={busy || !deductAmount}
              onClick={() => void act(
                { action: "deduct", amount: Number(deductAmount), reason: deductReason || undefined },
                `${Number(deductAmount).toLocaleString()} P 차감 완료`,
              )}
            >
              <Coins className="size-3 mr-1" /> 차감
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
