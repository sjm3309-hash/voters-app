"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Flame, Headphones, Heart, Loader2, Send, Sparkles } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  createCustomerCenterPost,
  fetchMyInquiries,
  fetchProposals,
  fetchUserLikedProposalIds,
  toggleProposalLike,
  type CustomerCenterPostRow,
} from "@/lib/customer-center";
import { useUserPointsBalance } from "@/lib/points";
import { cn } from "@/lib/utils";

function formatTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function CustomerCenterClient() {
  const router = useRouter();
  const { userId, points: userBalance } = useUserPointsBalance();

  const [tab, setTab] = useState<"inquiry" | "proposal">("inquiry");
  const [loading, setLoading] = useState(true);
  const [proposalOrder, setProposalOrder] = useState<"likes" | "recent">("likes");

  const [inquiries, setInquiries] = useState<CustomerCenterPostRow[]>([]);
  const [proposals, setProposals] = useState<CustomerCenterPostRow[]>([]);
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());

  const [inquiryTitle, setInquiryTitle] = useState("");
  const [inquiryBody, setInquiryBody] = useState("");
  const [proposalTitle, setProposalTitle] = useState("");
  const [proposalBody, setProposalBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canWrite = userId !== "anon";

  const loadInquiries = useCallback(async () => {
    const { data, error } = await fetchMyInquiries();
    if (error) setError(error.message);
    setInquiries(data ?? []);
  }, []);

  const loadProposals = useCallback(async () => {
    const { data, error } = await fetchProposals(proposalOrder);
    if (error) setError(error.message);
    const list = data ?? [];
    setProposals(list);
    const ids = await fetchUserLikedProposalIds(list.map((p) => p.id));
    setLikedIds(ids);
  }, [proposalOrder]);

  const reloadAll = useCallback(async () => {
    setError(null);
    await Promise.all([loadInquiries(), loadProposals()]);
  }, [loadInquiries, loadProposals]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      await reloadAll();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadAll]);

  const handleSubmitInquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite) return;
    setSubmitting(true);
    setError(null);
    try {
      const { id, error } = await createCustomerCenterPost({
        title: inquiryTitle.trim(),
        content: inquiryBody.trim(),
        category: "inquiry",
      });
      if (error) throw error;
      setInquiryTitle("");
      setInquiryBody("");
      await reloadAll();
      if (id) router.push(`/customer-center/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canWrite) return;
    setSubmitting(true);
    setError(null);
    try {
      const { id, error } = await createCustomerCenterPost({
        title: proposalTitle.trim(),
        content: proposalBody.trim(),
        category: "proposal",
      });
      if (error) throw error;
      setProposalTitle("");
      setProposalBody("");
      await reloadAll();
      if (id) router.push(`/customer-center/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const proposalCards = useMemo(() => proposals, [proposals]);

  return (
    <div className="min-h-screen bg-background">
      <Navbar balance={userBalance} userId={userId} />
      <main className="px-4 md:px-6 py-6 md:py-8 max-w-5xl mx-auto">
        <Button variant="ghost" onClick={() => router.push("/")} className="-ml-2 mb-4">
          <ArrowLeft className="size-4" />
          홈
        </Button>

        <div className="flex items-start justify-between gap-4 mb-5">
          <div>
            <h1 className="text-2xl md:text-3xl font-black tracking-tight text-foreground flex items-center gap-2">
              <Headphones className="size-6 text-chart-5" />
              고객센터
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              1:1 문의(비공개)와 베팅 아이디어 제안(공개)을 남길 수 있어요.
            </p>
          </div>
          <div className="text-xs text-muted-foreground">
            {canWrite ? "로그인됨" : "로그인 필요"}
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-500/35 bg-red-500/[0.08] px-4 py-2.5">
            <p className="text-sm text-red-500">{error}</p>
          </div>
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as any)} className="w-full">
          <TabsList className="grid grid-cols-2 w-full">
            <TabsTrigger value="inquiry">1:1 문의하기</TabsTrigger>
            <TabsTrigger value="proposal">베팅 아이디어 제안</TabsTrigger>
          </TabsList>

          <TabsContent value="inquiry" className="mt-6 space-y-6">
            <section className="rounded-xl border border-border/60 bg-card/60 p-4 md:p-5">
              <h2 className="text-sm font-bold text-foreground mb-3">문의 남기기 (비공개)</h2>
              <form onSubmit={handleSubmitInquiry} className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="inquiry-title">제목</Label>
                  <Input
                    id="inquiry-title"
                    value={inquiryTitle}
                    onChange={(e) => setInquiryTitle(e.target.value)}
                    placeholder="문의 제목"
                    disabled={!canWrite || submitting}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="inquiry-body">내용</Label>
                  <Textarea
                    id="inquiry-body"
                    value={inquiryBody}
                    onChange={(e) => setInquiryBody(e.target.value)}
                    placeholder="운영자에게 전달할 내용을 입력하세요"
                    className="min-h-28"
                    disabled={!canWrite || submitting}
                  />
                </div>
                <Button type="submit" disabled={!canWrite || submitting || !inquiryTitle.trim() || !inquiryBody.trim()}>
                  {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  제출
                </Button>
                {!canWrite && (
                  <p className="text-xs text-muted-foreground">
                    로그인 후 이용할 수 있어요.
                  </p>
                )}
              </form>
            </section>

            <section>
              <h3 className="text-sm font-bold text-foreground mb-2">
                내 문의 내역 <span className="text-muted-foreground font-normal">({inquiries.length})</span>
              </h3>
              {loading ? (
                <p className="text-sm text-muted-foreground">불러오는 중...</p>
              ) : inquiries.length === 0 ? (
                <p className="text-sm text-muted-foreground">아직 문의가 없습니다.</p>
              ) : (
                <div className="space-y-2">
                  {inquiries.map((p) => (
                    <Link
                      key={p.id}
                      href={`/customer-center/${p.id}`}
                      className="block rounded-xl border border-border/60 bg-secondary/20 px-4 py-3 hover:bg-secondary/35 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-semibold text-foreground line-clamp-1">{p.title}</p>
                        <span className="text-[11px] text-muted-foreground tabular-nums">{formatTime(p.created_at)}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-1">
                        {p.author_display_name ?? "익명"}
                      </p>
                    </Link>
                  ))}
                </div>
              )}
            </section>
          </TabsContent>

          <TabsContent value="proposal" className="mt-6 space-y-6">
            <section className="rounded-xl border border-border/60 bg-card/60 p-4 md:p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                <h2 className="text-sm font-bold text-foreground">아이디어 제안 (공개)</h2>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant={proposalOrder === "likes" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setProposalOrder("likes")}
                  >
                    <Flame className="size-4" />
                    인기순
                  </Button>
                  <Button
                    type="button"
                    variant={proposalOrder === "recent" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setProposalOrder("recent")}
                  >
                    <Sparkles className="size-4" />
                    최신순
                  </Button>
                </div>
              </div>
              <form onSubmit={handleSubmitProposal} className="space-y-3">
                <div className="space-y-1">
                  <Label htmlFor="proposal-title">제목</Label>
                  <Input
                    id="proposal-title"
                    value={proposalTitle}
                    onChange={(e) => setProposalTitle(e.target.value)}
                    placeholder="예: 이번 주말 경기, 이런 베팅 어때요?"
                    disabled={!canWrite || submitting}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="proposal-body">내용</Label>
                  <Textarea
                    id="proposal-body"
                    value={proposalBody}
                    onChange={(e) => setProposalBody(e.target.value)}
                    placeholder="아이디어를 자세히 적어주세요"
                    className="min-h-28"
                    disabled={!canWrite || submitting}
                  />
                </div>
                <Button type="submit" disabled={!canWrite || submitting || !proposalTitle.trim() || !proposalBody.trim()}>
                  {submitting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  등록
                </Button>
                {!canWrite && (
                  <p className="text-xs text-muted-foreground">
                    로그인 후 이용할 수 있어요.
                  </p>
                )}
              </form>
            </section>

            <section>
              <h3 className="text-sm font-bold text-foreground mb-2">
                제안 목록 <span className="text-muted-foreground font-normal">({proposalCards.length})</span>
              </h3>
              {loading ? (
                <p className="text-sm text-muted-foreground">불러오는 중...</p>
              ) : proposalCards.length === 0 ? (
                <p className="text-sm text-muted-foreground">아직 제안이 없습니다.</p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {proposalCards.map((p) => {
                    const liked = likedIds.has(p.id);
                    return (
                      <div
                        key={p.id}
                        className={cn(
                          "rounded-xl border border-border/60 bg-secondary/15 p-4 hover:bg-secondary/25 transition-colors",
                          p.like_count >= 10 ? "ring-1 ring-chart-5/30" : "",
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <Link href={`/customer-center/${p.id}`} className="min-w-0">
                            <p className="text-sm font-bold text-foreground line-clamp-2">{p.title}</p>
                            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{p.content}</p>
                            <p className="text-[11px] text-muted-foreground mt-2 tabular-nums">
                              {p.author_display_name ?? "익명"} · {formatTime(p.created_at)}
                            </p>
                          </Link>
                          <button
                            type="button"
                            className={cn(
                              "shrink-0 inline-flex items-center gap-1 rounded-lg px-2.5 py-2 border text-xs font-semibold transition-colors",
                              liked
                                ? "bg-neon-red/10 text-neon-red border-neon-red/20"
                                : "bg-secondary/30 text-muted-foreground border-border/50 hover:bg-secondary/60",
                            )}
                            onClick={async () => {
                              const next = await toggleProposalLike({ postId: p.id, currentlyLiked: liked });
                              if (next.error) {
                                setError(next.error.message);
                                return;
                              }
                              setLikedIds((prev) => {
                                const n = new Set(prev);
                                if (next.liked) n.add(p.id);
                                else n.delete(p.id);
                                return n;
                              });
                              setProposals((prev) =>
                                prev.map((x) => (x.id === p.id ? { ...x, like_count: next.likeCount } : x)),
                              );
                            }}
                            aria-label="추천"
                            disabled={!canWrite}
                          >
                            <Heart className={cn("size-4", liked ? "fill-current" : "")} />
                            <span>{p.like_count}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

