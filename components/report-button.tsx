"use client";

import { useState } from "react";
import { Flag, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { REPORT_REASONS } from "@/lib/reports-config";
import type { ReportTargetType, ReportReasonId } from "@/lib/reports-config";

interface ReportButtonProps {
  targetType: ReportTargetType;
  targetId: string;
  /** 로그인 여부 */
  canReport: boolean;
  className?: string;
  /** 작은 아이콘 모드 (기본 true) */
  iconOnly?: boolean;
}

export function ReportButton({
  targetType,
  targetId,
  canReport,
  className,
  iconOnly = true,
}: ReportButtonProps) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReasonId | "">("");
  const [detail, setDetail] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleOpen = () => {
    if (!canReport) {
      toast.error("로그인 후 신고할 수 있습니다.");
      return;
    }
    setOpen(true);
  };

  const handleSubmit = async () => {
    if (!reason) { toast.error("신고 사유를 선택해 주세요."); return; }
    setSubmitting(true);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetType, targetId, reason, detail }),
      });
      const json = await res.json();
      if (!json.ok) {
        if (json.error === "already_reported") {
          toast.info("이미 신고한 항목입니다.");
        } else {
          toast.error(json.message ?? "신고에 실패했습니다.");
        }
        return;
      }
      toast.success("신고가 접수되었습니다. 검토 후 처리하겠습니다.");
      setOpen(false);
      setReason("");
      setDetail("");
    } catch {
      toast.error("네트워크 오류가 발생했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-muted-foreground/60 hover:text-red-400 hover:bg-red-400/10 transition-colors",
          className,
        )}
        aria-label="신고"
        title="신고하기"
      >
        <Flag className="size-3.5" />
        {!iconOnly && <span>신고</span>}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Flag className="size-4 text-red-400" />
              신고하기
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 pt-1">
            <div>
              <p className="text-sm text-muted-foreground mb-2">신고 사유를 선택해 주세요</p>
              <div className="grid grid-cols-2 gap-2">
                {REPORT_REASONS.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setReason(r.id)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-xs font-medium transition-colors text-left",
                      reason === r.id
                        ? "border-red-400/50 bg-red-400/10 text-red-500"
                        : "border-border/50 bg-secondary/20 text-muted-foreground hover:bg-secondary/40",
                    )}
                  >
                    {r.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <Textarea
                value={detail}
                onChange={(e) => setDetail(e.target.value)}
                placeholder="추가 내용 (선택사항)"
                className="min-h-16 text-sm"
                maxLength={300}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)} disabled={submitting}>
                취소
              </Button>
              <Button
                size="sm"
                onClick={handleSubmit}
                disabled={!reason || submitting}
                className="bg-red-500 hover:bg-red-600 text-white border-0"
              >
                {submitting ? <Loader2 className="size-4 animate-spin" /> : <Flag className="size-4" />}
                신고 제출
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
