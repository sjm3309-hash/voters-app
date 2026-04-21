"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ImagePlus, Loader2 } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RichTextEditor } from "@/components/editor/rich-text-editor";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { type BoardCategoryId } from "@/lib/board";
import { safeReturnPath } from "@/lib/board-navigation";
import { uploadBoardImage, BOARD_IMAGE_MAX_PICK_MB } from "@/lib/board-image-upload";
import { checkAndGrantFirstPost } from "@/lib/daily-rewards";
import { useUserPointsBalance } from "@/lib/points";
import { getSubCategories, hasSubCategories, defaultSubCategory } from "@/lib/subcategories";
import { createClient } from "@/utils/supabase/client";
import { toast } from "sonner";

const categoryOptions: { value: BoardCategoryId; label: string }[] = [
  { value: "sports",   label: "⚽ 스포츠" },
  { value: "fun",      label: "😄 재미" },
  { value: "stocks",   label: "📈 주식" },
  { value: "crypto",   label: "🪙 크립토" },
  { value: "politics", label: "🏛️ 정치" },
  { value: "game",     label: "🎮 게임" },
  { value: "poljjak",  label: "🏀 폴짝" },
];

function stripHtml(html: string) {
  return html
    .replace(/&nbsp;/g, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isBoardCategoryId(v: string | null): v is BoardCategoryId {
  return categoryOptions.some((c) => c.value === v);
}

export function BoardWriteClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const { userId, points: userBalance } = useUserPointsBalance();
  const [authorName, setAuthorName] = useState("익명");
  const draftKey = useMemo(() => `voters.board.draft.${userId || "anon"}`, [userId]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const user = data?.user;
      if (!user) return;
      const name =
        user.user_metadata?.nickname ||
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email?.split("@")[0] ||
        "익명";
      setAuthorName(name);
    });
  }, [userId]);

  const initialCategory = useMemo(() => {
    const c = searchParams.get("category");
    return isBoardCategoryId(c) ? c : ("fun" as BoardCategoryId);
  }, [searchParams]);

  const listHref = useMemo(
    () => safeReturnPath(searchParams.get("next"), "/"),
    [searchParams],
  );
  const nextPreserve = searchParams.get("next");

  const [category, setCategory] = useState<BoardCategoryId>(initialCategory);
  const [subCategory, setSubCategory] = useState<string>(
    () => defaultSubCategory(initialCategory) ?? "other"
  );
  const [title, setTitle] = useState("");
  const [contentHtml, setContentHtml] = useState("");
  /** 상세 페이지용 full URL 목록 */
  const [images, setImages] = useState<string[]>([]);
  /** 목록/홈 썸네일용 URL 목록 (images 와 1:1 대응) */
  const [thumbImages, setThumbImages] = useState<string[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);

  useEffect(() => {
    setCategory(initialCategory);
    setSubCategory(defaultSubCategory(initialCategory) ?? "other");
  }, [initialCategory]);

  const plainText = useMemo(() => stripHtml(contentHtml), [contentHtml]);
  const hasBody = plainText.length > 0 || images.length > 0;
  const canSubmit = !!title.trim() && hasBody && !isSubmitting && !isUploadingImage;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (authorName === "익명") {
      toast.error("로그인 후 게시글을 작성할 수 있습니다.");
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        title: title.trim(),
        content: plainText || "(이미지)",
        contentHtml: contentHtml.trim() ? contentHtml : undefined,
        category,
        subCategory: hasSubCategories(category) ? subCategory : null,
        // 썸네일: 첫 번째 이미지의 thumb URL (목록/홈 표시용)
        thumbnail: thumbImages[0] ?? images[0],
        images: images.length > 0 ? images : undefined,
      };

      const res = await fetch("/api/board-posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(payload),
      });
      const json = await res.json();

      if (!res.ok || !json.ok) {
        toast.error(json.message ?? "게시글 등록에 실패했습니다.");
        return;
      }

      // 오늘 첫 게시글 작성 보상 (500P)
      void checkAndGrantFirstPost(userId);

      toast.success("게시글이 등록되었습니다!");

      const detailQs = new URLSearchParams();
      if (nextPreserve) detailQs.set("next", nextPreserve);
      router.push(
        `/board/${json.id}${detailQs.toString() ? `?${detailQs}` : ""}`,
      );
    } catch (e) {
      console.error(e);
      toast.error("서버 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar balance={userBalance} userId={userId} />

      <main className="px-4 md:px-6 py-6 md:py-8">
        <div className="grid grid-cols-1 xl:grid-cols-[10%_minmax(0,1fr)_10%] gap-6">
          {/* Left Ad Space */}
          <aside className="hidden xl:block">
            <div className="h-full rounded-xl border border-border/40 bg-secondary/10" />
          </aside>

          {/* Content */}
          <div className="min-w-0">
            <div className="max-w-3xl mx-auto">
              <Button variant="ghost" onClick={() => router.push(listHref)} className="-ml-2 mb-4">
                <ArrowLeft className="size-4" />
                목록
              </Button>

              <Card>
                <CardHeader>
                  <CardTitle>글쓰기</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {authorName === "익명" && (
                    <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
                      ⚠️ 로그인 후 게시글을 작성할 수 있습니다.
                    </div>
                  )}

                  <div className="space-y-3">
                    <Label>카테고리</Label>
                    <Select
                      value={category}
                      onValueChange={(v) => {
                        const cat = v as BoardCategoryId;
                        setCategory(cat);
                        setSubCategory(defaultSubCategory(cat) ?? "other");
                      }}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="카테고리를 선택하세요" />
                      </SelectTrigger>
                      <SelectContent>
                        {categoryOptions.map((c) => (
                          <SelectItem key={c.value} value={c.value}>
                            {c.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {/* 세부 카테고리 — 해당 카테고리에만 표시 */}
                    {hasSubCategories(category) && (
                      <div className="rounded-xl border border-border/40 bg-secondary/10 p-3 space-y-2">
                        <p className="text-xs font-semibold text-muted-foreground">세부 카테고리</p>
                        <div className="flex flex-wrap gap-1.5">
                          {getSubCategories(category).map((sub) => (
                            <button
                              key={sub.id}
                              type="button"
                              onClick={() => setSubCategory(sub.id)}
                              className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                                subCategory === sub.id
                                  ? "bg-chart-5/20 border-chart-5/60 text-chart-5"
                                  : "bg-background border-border/40 text-muted-foreground hover:border-border hover:text-foreground"
                              }`}
                            >
                              {sub.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>제목</Label>
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="제목을 입력하세요"
                      maxLength={100}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>내용</Label>
                    <RichTextEditor value={contentHtml} onChange={setContentHtml} placeholder="내용을 입력하세요" />
                  </div>

                  <div className="space-y-2">
                    <Label>
                      이미지 첨부 (최대 3장, 원본 장당 최대 {BOARD_IMAGE_MAX_PICK_MB}MB · 큰 사진은 자동 압축)
                    </Label>
                    <Input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={async (e) => {
                        setImageError(null);
                        const files = Array.from(e.target.files ?? []);
                        if (files.length === 0) return;

                        const currentCount = images.length;
                        const remaining = 3 - currentCount;
                        if (remaining <= 0) return;

                        const picked = files.slice(0, remaining);
                        setIsUploadingImage(true);
                        try {
                          const fullUrls: string[] = [];
                          const thumbUrls: string[] = [];
                          for (const file of picked) {
                            const result = await uploadBoardImage(file);
                            if (result) {
                              fullUrls.push(result.url);
                              thumbUrls.push(result.thumbUrl);
                            }
                          }
                          const rejected = picked.length - fullUrls.length;
                          if (rejected > 0) {
                            setImageError(
                              `이미지 ${rejected}개를 업로드하지 못했습니다. (원본 장당 최대 ${BOARD_IMAGE_MAX_PICK_MB}MB, JPG/PNG 등)`,
                            );
                          }
                          setImages((prev) => [...prev, ...fullUrls].slice(0, 3));
                          setThumbImages((prev) => [...prev, ...thumbUrls].slice(0, 3));
                        } finally {
                          setIsUploadingImage(false);
                        }
                        e.currentTarget.value = "";
                      }}
                    />
                    {isUploadingImage && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <Loader2 className="size-3 animate-spin" />
                        이미지 업로드 중...
                      </p>
                    )}
                    {imageError && <p className="text-xs text-destructive">{imageError}</p>}

                    {images.length > 0 ? (
                      <div className="grid grid-cols-3 gap-2">
                        {images.map((src, idx) => (
                          <div
                            key={`${src}-${idx}`}
                            className="relative overflow-hidden rounded-lg border border-border/50 bg-secondary/20"
                          >
                            <img src={src} alt="" className="aspect-square w-full object-cover" />
                            <button
                              type="button"
                              className="absolute top-1 right-1 rounded-md bg-background/80 px-2 py-0.5 text-xs text-foreground hover:bg-background"
                              onClick={() => {
                                setImages((prev) => prev.filter((_, i) => i !== idx));
                                setThumbImages((prev) => prev.filter((_, i) => i !== idx));
                              }}
                            >
                              제거
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <ImagePlus className="size-4" />
                        첨부한 첫 이미지는 목록에서 썸네일로 표시됩니다.
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const draft = {
                          category,
                          title,
                          contentHtml,
                          images,
                          thumbImages,
                          savedAt: new Date().toISOString(),
                        };
                        window.localStorage.setItem(draftKey, JSON.stringify(draft));
                        window.open(
                          `/board/preview?key=${encodeURIComponent(draftKey)}`,
                          "_blank",
                          "noopener,noreferrer"
                        );
                      }}
                    >
                      미리보기
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const draft = {
                          category,
                          title,
                          contentHtml,
                          images,
                          thumbImages,
                          savedAt: new Date().toISOString(),
                        };
                        window.localStorage.setItem(draftKey, JSON.stringify(draft));
                        toast.success("임시 저장되었습니다.");
                      }}
                    >
                      임시 저장
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const raw = window.localStorage.getItem(draftKey);
                        if (!raw) { toast.info("임시 저장된 글이 없습니다."); return; }
                        try {
                          const d = JSON.parse(raw) as {
                            category?: BoardCategoryId;
                            title?: string;
                            contentHtml?: string;
                            images?: string[];
                            thumbImages?: string[];
                          };
                          if (d.category) setCategory(d.category);
                          setTitle(d.title ?? "");
                          setContentHtml(d.contentHtml ?? "");
                          setImages(Array.isArray(d.images) ? d.images : []);
                          setThumbImages(Array.isArray(d.thumbImages) ? d.thumbImages : []);
                          toast.success("임시 저장된 글을 불러왔습니다.");
                        } catch {
                          // ignore
                        }
                      }}
                    >
                      임시 저장 불러오기
                    </Button>
                    <Button variant="outline" onClick={() => router.push(listHref)}>
                      취소
                    </Button>
                    <Button
                      onClick={handleSubmit}
                      disabled={!canSubmit}
                      className="bg-chart-5 text-primary-foreground hover:bg-chart-5/90"
                    >
                      {isSubmitting ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          등록 중...
                        </>
                      ) : (
                        "등록"
                      )}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Right Ad Space */}
          <aside className="hidden xl:block">
            <div className="h-full rounded-xl border border-border/40 bg-secondary/10" />
          </aside>
        </div>
      </main>
    </div>
  );
}
