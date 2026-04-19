"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { OPTION_FALLBACK_HEX } from "@/lib/option-colors";

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 5;

type OptionRow = { label: string; color: string };

function initialRows(): OptionRow[] {
  return [
    { label: "", color: OPTION_FALLBACK_HEX[0]! },
    { label: "", color: OPTION_FALLBACK_HEX[1]! },
  ];
}

export function CreateCustomBetForm({
  className,
  onCreated,
}: {
  className?: string;
  onCreated?: () => void;
}) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<"스포츠" | "게임">("스포츠");
  const [subCategory, setSubCategory] = useState("해외축구");
  const [beginLocal, setBeginLocal] = useState("");
  const [color, setColor] = useState("#6366f1");
  const [optionRows, setOptionRows] = useState<OptionRow[]>(initialRows);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const setOptionLabelAt = (i: number, v: string) => {
    setOptionRows((prev) => {
      const next = [...prev];
      next[i] = { ...next[i]!, label: v };
      return next;
    });
  };

  const setOptionColorAt = (i: number, v: string) => {
    setOptionRows((prev) => {
      const next = [...prev];
      next[i] = { ...next[i]!, color: v };
      return next;
    });
  };

  const addOption = () => {
    if (optionRows.length >= MAX_OPTIONS) return;
    setOptionRows((prev) => [
      ...prev,
      {
        label: "",
        color: OPTION_FALLBACK_HEX[prev.length % OPTION_FALLBACK_HEX.length]!,
      },
    ]);
  };

  const removeOption = (i: number) => {
    if (optionRows.length <= MIN_OPTIONS) return;
    setOptionRows((prev) => prev.filter((_, idx) => idx !== i));
  };

  const submit = async () => {
    setMessage(null);
    if (!title.trim()) {
      setMessage({ type: "err", text: "제목을 입력해 주세요." });
      return;
    }
    if (optionRows.some((r) => !r.label.trim())) {
      setMessage({
        type: "err",
        text: "모든 선택지 이름을 입력하거나 빈 줄을 삭제해 주세요.",
      });
      return;
    }
    if (optionRows.length < MIN_OPTIONS || optionRows.length > MAX_OPTIONS) {
      setMessage({
        type: "err",
        text: `선택지는 ${MIN_OPTIONS}~${MAX_OPTIONS}개여야 합니다.`,
      });
      return;
    }
    const payloadOpts = optionRows.map((r) => ({
      label: r.label.trim(),
      color: r.color.trim(),
    }));
    if (new Set(payloadOpts.map((r) => r.label)).size !== payloadOpts.length) {
      setMessage({ type: "err", text: "선택지 이름이 서로 달라야 합니다." });
      return;
    }
    if (!beginLocal) {
      setMessage({ type: "err", text: "경기 시작(마감 기준) 일시를 선택해 주세요." });
      return;
    }

    const iso = new Date(beginLocal).toISOString();
    if (!Number.isFinite(Date.parse(iso))) {
      setMessage({ type: "err", text: "유효한 일시가 아닙니다." });
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/create-custom-bet", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          category,
          subCategory: subCategory.trim() || "기타",
          beginAt: iso,
          color: color.trim(),
          options: payloadOpts,
        }),
      });
      const j = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        errors?: string[];
        error?: string;
        bet?: { id?: string };
      };
      if (!res.ok || !j.ok) {
        const detail =
          (Array.isArray(j.errors) ? j.errors.join(", ") : null) ||
          j.error ||
          res.statusText;
        throw new Error(detail);
      }
      setMessage({
        type: "ok",
        text: `등록했습니다.${j.bet?.id ? ` (ID ${j.bet.id.slice(0, 8)}…)` : ""}`,
      });
      setTitle("");
      setBeginLocal("");
      setOptionRows(initialRows());
      onCreated?.();
    } catch (e) {
      setMessage({
        type: "err",
        text: e instanceof Error ? e.message : "등록에 실패했습니다.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className={cn(
        "rounded-xl border border-chart-5/25 bg-chart-5/[0.06] p-4 space-y-4",
        className,
      )}
    >
      <div>
        <h2 className="text-sm font-bold text-foreground">운영자 보트 만들기</h2>
        <p className="text-xs text-muted-foreground mt-1">
          선택지는 DB <code className="text-[11px]">bets.options</code>(JSONB)에 저장되며, 유저 화면 버튼·정산에 그대로 반영됩니다.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1.5 block">
          <span className="text-xs font-medium text-muted-foreground">제목</span>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 맨유 vs 리버풀"
            className="h-9 text-sm"
          />
        </label>
        <label className="space-y-1.5 block">
          <span className="text-xs font-medium text-muted-foreground">카테고리</span>
          <select
            value={category}
            onChange={(e) =>
              setCategory(e.target.value === "게임" ? "게임" : "스포츠")
            }
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
          >
            <option value="스포츠">스포츠</option>
            <option value="게임">게임</option>
          </select>
        </label>
        <label className="space-y-1.5 block">
          <span className="text-xs font-medium text-muted-foreground">세부 카테고리</span>
          <Input
            value={subCategory}
            onChange={(e) => setSubCategory(e.target.value)}
            placeholder="예: 해외축구"
            className="h-9 text-sm"
          />
        </label>
        <label className="space-y-1.5 block">
          <span className="text-xs font-medium text-muted-foreground">
            마감 기준 시각 (경기 시작)
          </span>
          <Input
            type="datetime-local"
            value={beginLocal}
            onChange={(e) => setBeginLocal(e.target.value)}
            className="h-9 text-sm"
          />
        </label>
        <label className="space-y-1.5 block sm:col-span-2">
          <span className="text-xs font-medium text-muted-foreground">대표 색 (hex)</span>
          <div className="flex gap-2 items-center">
            <input
              type="color"
              value={color.length === 7 ? color : "#6366f1"}
              onChange={(e) => setColor(e.target.value)}
              className="h-9 w-14 cursor-pointer rounded border border-input bg-background p-1"
              aria-label="색 선택"
            />
            <Input
              value={color}
              onChange={(e) => setColor(e.target.value)}
              placeholder="#RRGGBB"
              className="h-9 text-sm flex-1 max-w-[10rem]"
            />
          </div>
        </label>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            선택지 ({MIN_OPTIONS}~{MAX_OPTIONS}개)
          </span>
          {optionRows.length < MAX_OPTIONS && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1 text-xs"
              onClick={addOption}
            >
              <Plus className="size-3.5" />
              옵션 추가
            </Button>
          )}
        </div>
        <div className="space-y-2">
          {optionRows.map((row, idx) => (
            <div key={idx} className="flex flex-wrap gap-2 items-center">
              <span className="text-[11px] tabular-nums text-muted-foreground w-6 shrink-0">
                {idx + 1}.
              </span>
              <Input
                value={row.label}
                onChange={(e) => setOptionLabelAt(idx, e.target.value)}
                placeholder={
                  idx === 0 ? "예: 맨유" : idx === 1 ? "예: 리버풀" : "선택지 이름"
                }
                className="h-9 text-sm flex-1 min-w-[8rem]"
              />
              <div className="flex items-center gap-1.5 shrink-0">
                <input
                  type="color"
                  value={row.color.length === 7 ? row.color : "#6366f1"}
                  onChange={(e) => setOptionColorAt(idx, e.target.value)}
                  className="h-9 w-11 cursor-pointer rounded border border-input bg-background p-0.5"
                  aria-label={`선택지 ${idx + 1} 색`}
                />
                <Input
                  value={row.color}
                  onChange={(e) => setOptionColorAt(idx, e.target.value)}
                  placeholder="#RRGGBB"
                  className="h-9 w-[6.5rem] text-xs font-mono px-2"
                />
              </div>
              {optionRows.length > MIN_OPTIONS && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0 size-9 text-muted-foreground"
                  onClick={() => removeOption(idx)}
                  aria-label={`선택지 ${idx + 1} 삭제`}
                >
                  <Trash2 className="size-4" />
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>

      {message && (
        <p
          className={cn(
            "text-sm rounded-lg px-3 py-2",
            message.type === "ok"
              ? "bg-green-500/10 text-green-700 dark:text-green-400"
              : "bg-destructive/10 text-destructive",
          )}
        >
          {message.text}
        </p>
      )}

      <Button
        type="button"
        className="w-full sm:w-auto font-semibold"
        style={{ background: "var(--chart-5)", color: "white" }}
        disabled={submitting}
        onClick={() => void submit()}
      >
        {submitting ? (
          <>
            <Loader2 className="size-4 animate-spin mr-2 inline" />
            저장 중…
          </>
        ) : (
          "보트 등록"
        )}
      </Button>
    </div>
  );
}
