"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Tag } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { BoardCategoryId } from "@/lib/board";
import { sanitizeHtml } from "@/lib/sanitize-html";
import { useUserPointsBalance } from "@/lib/points";

type Draft = {
  category?: BoardCategoryId;
  title?: string;
  contentHtml?: string;
  images?: string[];
  savedAt?: string;
};

const categoryLabel: Record<BoardCategoryId, string> = {
  sports: "스포츠",
  fun: "재미",
  stocks: "주식",
  crypto: "크립토",
  politics: "정치",
  game: "게임",
  suggest: "건의",
};

export function BoardPreviewClient() {
  const searchParams = useSearchParams();
  const { userId, points: userBalance } = useUserPointsBalance();

  const key = searchParams.get("key") || "";
  const [draft, setDraft] = useState<Draft | null>(null);

  useEffect(() => {
    if (!key) return;
    const raw = window.localStorage.getItem(key);
    if (!raw) {
      setDraft(null);
      return;
    }
    try {
      setDraft(JSON.parse(raw) as Draft);
    } catch {
      setDraft(null);
    }
  }, [key]);

  const title = useMemo(() => draft?.title?.trim() || "(제목 없음)", [draft]);
  const category = useMemo(() => draft?.category || ("fun" as BoardCategoryId), [draft]);
  const contentHtml = useMemo(
    () => sanitizeHtml(draft?.contentHtml || "<p>(내용이 없습니다)</p>"),
    [draft]
  );
  const images = useMemo(() => (Array.isArray(draft?.images) ? draft!.images! : []), [draft]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar balance={userBalance} userId={userId} />

      <main className="px-4 md:px-6 py-6 md:py-8 max-w-3xl mx-auto">
        <div className="text-sm text-muted-foreground mb-4">
          업로드 전 미리보기 화면입니다. (이 창은 자동 저장된 초안을 보여줍니다)
        </div>

        <Card>
          <CardHeader className="gap-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Tag className="size-4" />
                {categoryLabel[category]}
              </span>
              {draft?.savedAt && (
                <>
                  <span>·</span>
                  <span>{new Date(draft.savedAt).toLocaleString("ko-KR")}</span>
                </>
              )}
            </div>
            <CardTitle className="text-xl md:text-2xl leading-snug break-words">
              {title}
            </CardTitle>
          </CardHeader>

          <CardContent>
            {images.length > 0 && (
              <div className="mb-5 space-y-3">
                {images.map((src, idx) => (
                  <a
                    key={`${src}-${idx}`}
                    href={src}
                    target="_blank"
                    rel="noreferrer"
                    className="block overflow-hidden rounded-xl border border-border/50 bg-secondary/10"
                  >
                    <img src={src} alt="" className="w-full max-h-[520px] object-contain bg-black/5" />
                  </a>
                ))}
              </div>
            )}

            <div
              className="prose prose-sm md:prose-base max-w-none prose-p:my-2 prose-ul:my-2 prose-ol:my-2 prose-li:my-1 prose-a:text-neon-blue prose-a:underline-offset-4"
              dangerouslySetInnerHTML={{ __html: contentHtml }}
            />
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

