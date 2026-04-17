"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlignCenter,
  AlignJustify,
  AlignLeft,
  AlignRight,
  Bold,
  Italic,
  Link2,
  List,
  ListOrdered,
  Pilcrow,
  Underline,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (html: string) => void;
  className?: string;
  placeholder?: string;
};

export function RichTextEditor({ value, onChange, className, placeholder }: Props) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [focused, setFocused] = useState(false);
  const [fontFamily, setFontFamily] = useState("sans");
  const [fontSize, setFontSize] = useState("16");
  const [lineHeight, setLineHeight] = useState("1.7");

  // Keep DOM in sync when value changes externally
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.innerHTML !== value) {
      el.innerHTML = value || "";
    }
  }, [value]);

  const canShowPlaceholder = useMemo(() => {
    if (focused) return false;
    const el = ref.current;
    const html = el?.innerHTML ?? value ?? "";
    return !html || html === "<br>";
  }, [focused, value]);

  const exec = (command: string, arg?: string) => {
    // execCommand is deprecated but widely supported and sufficient for demo editor.
    document.execCommand(command, false, arg);
    const el = ref.current;
    if (!el) return;
    onChange(el.innerHTML);
    el.focus();
  };

  const insertStyledSpan = (styles: Record<string, string>) => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    const container = document.createElement("div");
    container.appendChild(range.cloneContents());
    const html = container.innerHTML;
    const styleStr = Object.entries(styles)
      .map(([k, v]) => `${k}:${v}`)
      .join(";");

    // If nothing selected, create a span that user can type into.
    const payload = html
      ? `<span style="${styleStr}">${html}</span>`
      : `<span style="${styleStr}">\u200b</span>`;

    document.execCommand("insertHTML", false, payload);
    const el = ref.current;
    if (!el) return;
    onChange(el.innerHTML);
    el.focus();
  };

  const applyFontFamily = (next: string) => {
    setFontFamily(next);
    const css =
      next === "serif"
        ? "ui-serif, Georgia, Cambria, \"Times New Roman\", Times, serif"
        : next === "mono"
          ? "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace"
          : "ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, \"Apple Color Emoji\", \"Segoe UI Emoji\"";
    insertStyledSpan({ "font-family": css });
  };

  const applyFontSize = (px: string) => {
    setFontSize(px);
    insertStyledSpan({ "font-size": `${px}px` });
  };

  const applyLineHeight = (lh: string) => {
    setLineHeight(lh);
    insertStyledSpan({ "line-height": lh });
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-secondary/20 px-2 py-1">
          <label className="text-xs text-muted-foreground">글꼴</label>
          <select
            value={fontFamily}
            onChange={(e) => applyFontFamily(e.target.value)}
            className="h-8 rounded-md border border-border/50 bg-background px-2 text-sm"
          >
            <option value="sans">기본</option>
            <option value="serif">명조</option>
            <option value="mono">고정폭</option>
          </select>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-secondary/20 px-2 py-1">
          <label className="text-xs text-muted-foreground">크기</label>
          <select
            value={fontSize}
            onChange={(e) => applyFontSize(e.target.value)}
            className="h-8 rounded-md border border-border/50 bg-background px-2 text-sm"
          >
            <option value="14">14</option>
            <option value="16">16</option>
            <option value="18">18</option>
            <option value="20">20</option>
            <option value="24">24</option>
          </select>
        </div>

        <div className="flex items-center gap-2 rounded-lg border border-border/50 bg-secondary/20 px-2 py-1">
          <label className="text-xs text-muted-foreground">줄간격</label>
          <select
            value={lineHeight}
            onChange={(e) => applyLineHeight(e.target.value)}
            className="h-8 rounded-md border border-border/50 bg-background px-2 text-sm"
          >
            <option value="1.4">1.4</option>
            <option value="1.6">1.6</option>
            <option value="1.7">1.7</option>
            <option value="1.9">1.9</option>
            <option value="2.1">2.1</option>
          </select>
        </div>

        <Button type="button" variant="outline" size="sm" onClick={() => exec("bold")}>
          <Bold className="size-4" />
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => exec("italic")}>
          <Italic className="size-4" />
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => exec("underline")}>
          <Underline className="size-4" />
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => exec("justifyLeft")}>
          <AlignLeft className="size-4" />
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => exec("justifyCenter")}>
          <AlignCenter className="size-4" />
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => exec("justifyRight")}>
          <AlignRight className="size-4" />
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => exec("justifyFull")}>
          <AlignJustify className="size-4" />
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => exec("insertUnorderedList")}>
          <List className="size-4" />
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => exec("insertOrderedList")}>
          <ListOrdered className="size-4" />
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => exec("formatBlock", "p")}>
          <Pilcrow className="size-4" />
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            const url = window.prompt("링크 URL을 입력하세요");
            if (!url) return;
            exec("createLink", url);
          }}
        >
          <Link2 className="size-4" />
        </Button>
      </div>

      <div className="relative">
        {canShowPlaceholder && (
          <div className="pointer-events-none absolute left-3 top-2.5 text-sm text-muted-foreground">
            {placeholder ?? "내용을 입력하세요"}
          </div>
        )}
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onInput={(e) => {
            onChange((e.target as HTMLDivElement).innerHTML);
          }}
          className={cn(
            "min-h-40 w-full rounded-md border border-border/60 bg-transparent px-3 py-2 text-sm leading-7 outline-none focus-visible:ring-2 focus-visible:ring-neon-blue/30",
            "prose prose-sm max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-a:text-neon-blue prose-a:underline-offset-4",
          )}
        />
      </div>
    </div>
  );
}

