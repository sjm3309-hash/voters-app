"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { createClient } from "@/utils/supabase/client";
import { setUserPoints } from "@/lib/points";

type ProfileSnapshot = {
  pebbles: number;
  lastBankruptcyDrawAt: string | null;
};

type DrawResult =
  | { ok: true; amount: number; jackpot?: boolean; band?: { label: string; min: number; max: number } }
  | { ok: false; error?: string; message?: string; nextEligibleAt?: string };

const COOLDOWN_DAYS = 7;
const POLL_MS = 15_000;

function isEligible(p: ProfileSnapshot, nowMs = Date.now()): boolean {
  if (p.pebbles !== 0) return false;
  if (!p.lastBankruptcyDrawAt) return true;
  const lastMs = Date.parse(p.lastBankruptcyDrawAt);
  if (!Number.isFinite(lastMs)) return true;
  const nextMs = lastMs + COOLDOWN_DAYS * 24 * 60 * 60 * 1000;
  return nowMs >= nextMs;
}

async function fetchProfileSnapshot(userId: string): Promise<ProfileSnapshot | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("pebbles, last_bankruptcy_draw_at")
    .eq("id", userId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    pebbles: Math.max(0, Math.floor(Number((data as any).pebbles ?? 0) || 0)),
    lastBankruptcyDrawAt: ((data as any).last_bankruptcy_draw_at as string | null) ?? null,
  };
}

export function BankruptcyModal() {
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<ProfileSnapshot | null>(null);
  const [phase, setPhase] = useState<"idle" | "drawing" | "won">("idle");
  const [wonAmount, setWonAmount] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const mountedRef = useRef(false);

  const eligible = useMemo(() => (profile ? isEligible(profile) : false), [profile]);

  useEffect(() => {
    mountedRef.current = true;
    const supabase = createClient();

    const sync = async (uid: string | null) => {
      setUserId(uid);
      setProfile(null);
      setOpen(false);
      setPhase("idle");
      setWonAmount(null);
      setErrorMsg(null);
      if (!uid) return;
      const snap = await fetchProfileSnapshot(uid);
      if (!mountedRef.current) return;
      setProfile(snap);
      if (snap && isEligible(snap)) setOpen(true);
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      sync(session?.user?.id ?? null);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      sync(session?.user?.id ?? null);
    });

    const interval = window.setInterval(async () => {
      if (!userId) return;
      const snap = await fetchProfileSnapshot(userId);
      if (!mountedRef.current) return;
      if (snap) {
        setProfile(snap);
        if (isEligible(snap)) setOpen(true);
      }
    }, POLL_MS);

    return () => {
      mountedRef.current = false;
      listener.subscription.unsubscribe();
      window.clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // keep modal open state aligned as profile updates
    if (!profile) return;
    if (isEligible(profile)) setOpen(true);
  }, [profile]);

  async function handleDraw() {
    if (!userId) return;
    setPhase("drawing");
    setErrorMsg(null);
    setWonAmount(null);
    try {
      const res = await fetch("/api/bankruptcy-draw", { method: "POST" });
      const json = (await res.json().catch(() => null)) as DrawResult | null;

      if (!res.ok || !json || (json as any).ok !== true) {
        const msg =
          (json as any)?.message ||
          (json as any)?.error ||
          "제비뽑기에 실패했습니다. 잠시 후 다시 시도해 주세요.";
        setErrorMsg(String(msg));
        setPhase("idle");
        // refresh profile in case server updated cooldown/pebbles
        const snap = await fetchProfileSnapshot(userId);
        setProfile(snap);
        return;
      }

      const amount = Math.max(0, Math.floor(Number((json as any).amount) || 0));
      setWonAmount(amount);
      setPhase("won");

      // main 화면 잔액 즉시 업데이트 (현재 앱은 localStorage 기반 포인트도 사용)
      setUserPoints(userId, amount);

      const snap = await fetchProfileSnapshot(userId);
      setProfile(snap);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : String(e));
      setPhase("idle");
    }
  }

  function handleClose() {
    setOpen(false);
    setPhase("idle");
    setWonAmount(null);
    setErrorMsg(null);
  }

  // 로그인 안 했거나 조건 불만족이면 렌더링만 하고 열지 않음
  if (!userId) return null;
  if (!eligible && !open) return null;

  return (
    <Dialog open={open} onOpenChange={(v) => (phase === "drawing" ? null : setOpen(v))}>
      <DialogContent
        showCloseButton={phase !== "drawing"}
        className="max-w-md border-chart-5/30 shadow-[0_0_0_1px_rgba(168,85,247,0.18),0_16px_60px_-20px_rgba(168,85,247,0.45)]"
      >
        <DialogHeader>
          <DialogTitle className="text-center text-xl">
            파산하셨군요... <span className="inline-block">🥲</span>
          </DialogTitle>
          <DialogDescription className="text-center leading-relaxed">
            운영자가 드리는 이번 주 마지막 기회! 제비뽑기에 참여하고 최대{" "}
            <span className="font-semibold text-foreground">10,000 페블</span>을 노려보세요.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 space-y-3">
          {phase === "won" && wonAmount != null ? (
            <div className="rounded-lg border border-chart-5/25 bg-chart-5/10 p-4 text-center">
              <div className="mx-auto mb-2 flex w-fit items-center gap-2 rounded-full bg-background/60 px-3 py-1 text-sm font-semibold text-chart-5 border border-chart-5/25">
                <Sparkles className="size-4" />
                당첨 결과
              </div>
              <div className="text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-chart-5 via-fuchsia-500 to-pink-500">
                🎉 {wonAmount.toLocaleString()} 페블 당첨!
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                확인을 누르면 모달이 닫히고 잔액이 즉시 반영됩니다.
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-border/60 bg-secondary/40 p-4 text-sm text-muted-foreground">
              조건 충족 시에만 자동으로 노출됩니다. (잔액 0 + 최근 7일 내 수령 이력 없음)
            </div>
          )}

          {errorMsg && (
            <div className="rounded-lg border border-red-500/25 bg-red-500/10 p-3 text-sm text-red-600 dark:text-red-400">
              {errorMsg}
            </div>
          )}

          <div className="flex gap-2">
            {phase === "won" ? (
              <Button className="w-full bg-chart-5 hover:bg-chart-5/90" onClick={handleClose}>
                확인
              </Button>
            ) : (
              <Button
                className="w-full bg-chart-5 hover:bg-chart-5/90"
                onClick={handleDraw}
                disabled={phase === "drawing"}
              >
                {phase === "drawing" ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="size-4 animate-spin" />
                    제비뽑는 중...
                  </span>
                ) : (
                  "[제비뽑기 시작!]"
                )}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

