"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, ImagePlus } from "lucide-react";
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
import { loadBoardPosts, saveBoardPosts, type BoardCategoryId, type BoardPost } from "@/lib/board";
import { checkAndGrantFirstPost } from "@/lib/daily-rewards";
import { useUserPointsBalance } from "@/lib/points";
import { createClient } from "@/utils/supabase/client";

const categoryOptions: { value: BoardCategoryId; label: string }[] = [
  { value: "sports",  label: "스포츠" },
  { value: "fun",     label: "재미" },
  { value: "stocks",  label: "주식" },
  { value: "crypto",  label: "크립토" },
  { value: "politics",label: "정치" },
  { value: "game",    label: "게임" },
  { value: "suggest", label: "건의" },
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

  const [category, setCategory] = useState<BoardCategoryId>(initialCategory);
  const [title, setTitle] = useState("");
  const [contentHtml, setContentHtml] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [imageError, setImageError] = useState<string | null>(null);

  useEffect(() => {
    setCategory(initialCategory);
  }, [initialCategory]);

  const plainText = useMemo(() => stripHtml(contentHtml), [contentHtml]);
  const hasBody = plainText.length > 0 || images.length > 0;
  const canSubmit = !!title.trim() && hasBody;

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
              <Button variant="ghost" onClick={() => router.push("/")} className="-ml-2 mb-4">
                <ArrowLeft className="size-4" />
                목록
              </Button>

              <Card>
                <CardHeader>
                  <CardTitle>글쓰기</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {authorName === "익명" && (
                    <div className="rounded-lg border border-border/50 bg-secondary/10 px-4 py-3 text-sm text-muted-foreground">
                      로그인하지 않아도 글쓰기는 가능하며, 작성자는 <span className="font-semibold text-foreground">익명</span>으로 표시됩니다.
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label>카테고리(상위탭)</Label>
                    <Select value={category} onValueChange={(v) => setCategory(v as BoardCategoryId)}>
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
                  </div>

                  <div className="space-y-2">
                    <Label>제목</Label>
                    <Input
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="제목을 입력하세요"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label>내용</Label>
                    <RichTextEditor value={contentHtml} onChange={setContentHtml} placeholder="내용을 입력하세요" />
                  </div>

                  <div className="space-y-2">
                    <Label>이미지 첨부 (최대 3장, 장당 1MB)</Label>
                    <Input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={async (e) => {
                        setImageError(null);
                        const files = Array.from(e.target.files ?? []);
                        if (files.length === 0) return;

                        const picked = files.slice(0, 3);
                        const readers = picked.map(
                          (file) =>
                            new Promise<string | null>((resolve) => {
                              if (file.size > 1024 * 1024) return resolve(null);
                              const r = new FileReader();
                              r.onload = () => resolve(typeof r.result === "string" ? r.result : null);
                              r.onerror = () => resolve(null);
                              r.readAsDataURL(file);
                            })
                        );
                        const results = (await Promise.all(readers)).filter(Boolean) as string[];
                        const rejected = picked.length - results.length;
                        if (rejected > 0) {
                          setImageError(`이미지 ${rejected}개가 용량 제한(1MB)으로 제외되었습니다.`);
                        }
                        setImages((prev) => [...prev, ...results].slice(0, 3));
                        e.currentTarget.value = "";
                      }}
                    />
                    {imageError && <p className="text-xs text-neon-red">{imageError}</p>}

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
                              onClick={() => setImages((prev) => prev.filter((_, i) => i !== idx))}
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

                  <div className="flex justify-end gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const draft = {
                          category,
                          title,
                          contentHtml,
                          images,
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
                          savedAt: new Date().toISOString(),
                        };
                        window.localStorage.setItem(draftKey, JSON.stringify(draft));
                      }}
                    >
                      임시 저장
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => {
                        const raw = window.localStorage.getItem(draftKey);
                        if (!raw) return;
                        try {
                          const d = JSON.parse(raw) as {
                            category?: BoardCategoryId;
                            title?: string;
                            contentHtml?: string;
                            images?: string[];
                          };
                          if (d.category) setCategory(d.category);
                          setTitle(d.title ?? "");
                          setContentHtml(d.contentHtml ?? "");
                          setImages(Array.isArray(d.images) ? d.images : []);
                        } catch {
                          // ignore
                        }
                      }}
                    >
                      임시 저장 불러오기
                    </Button>
                    <Button variant="outline" onClick={() => router.push("/")}>
                      취소
                    </Button>
                    <Button
                      onClick={() => {
                        const plain = plainText;
                        if (!title.trim() || !hasBody) return;
                        const id = `${Date.now()}`;
                        const next: BoardPost = {
                          id,
                          title: title.trim(),
                          content: plain || "(이미지)",
                          contentHtml: contentHtml.trim() ? contentHtml : undefined,
                          category,
                          images: images.length > 0 ? images : undefined,
                          thumbnail: images[0],
                          commentCount: 0,
                          author: authorName,
                          createdAt: new Date().toISOString(),
                        };
                        const prev = loadBoardPosts();
                        const merged = [next, ...prev];
                        saveBoardPosts(merged);
                        // 오늘 첫 게시글 작성 보상 (500P)
                        checkAndGrantFirstPost(userId);
                        router.push(`/board/${id}`);
                      }}
                      disabled={!canSubmit}
                      className="bg-chart-5 text-primary-foreground hover:bg-chart-5/90"
                    >
                      등록
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

