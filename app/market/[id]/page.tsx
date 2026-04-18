"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft, Award, CheckCircle2, Clock, Coins, ExternalLink, Eye, ThumbsUp, TrendingUp, Trophy, Users, X } from "lucide-react";
import { ReportButton } from "@/components/report-button";
import { DislikeButton } from "@/components/dislike-button";
import { Navbar } from "@/components/navbar";
import { Badge } from "@/components/ui/badge";
import { OddsPoolChart } from "@/components/odds-pool-chart";
import { BetPanel } from "@/components/bet-panel";
import { BoatCommentsSection } from "@/components/boat-comments-section";
import { CountdownTimer } from "@/components/CountdownTimer";
import { cn } from "@/lib/utils";
import { getLikeCount, hasLiked, toggleLike } from "@/lib/likes";
import { addMarketComment, getCommentsForMarket, type MarketComment } from "@/lib/market-comments";
import {
  addMarketBet,
  getBetsForMarket,
  getUserBetsOnOption,
  replaceBetsForMarketFromTotals,
  type MarketBet,
} from "@/lib/market-bets";
import { earnUserPoints, refreshPebblesFromServer, setUserPoints, useUserPointsBalance } from "@/lib/points";
import { toast } from "sonner";
import { checkAndGrantLikeReward } from "@/lib/daily-rewards";
import { getUserMarketById, updateUserMarket, type UserMarket } from "@/lib/markets";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { getMarketViews, incrementMarketViews } from "@/lib/market-views";
import {
  calculateFees,
  calculateUserPayout,
  hasClaimedWinnings,
  markWinningsClaimed,
} from "@/lib/market-settlement";
import { createClient } from "@/utils/supabase/client";
import type { BetFeedMarketWire } from "@/lib/bets-feed-wire";
import { isUuidString } from "@/lib/is-uuid";
import {
  accentMutedBackground,
  accentMutedBorder,
  pickReadableTextOnAccent,
  resolveOptionColor,
} from "@/lib/option-colors";
import { safeReturnPath } from "@/lib/board-navigation";

// Colors for multi-choice options
const optionColors = [
  "oklch(0.7 0.18 230)",  // neon blue
  "oklch(0.7 0.18 150)",  // neon green
  "oklch(0.65 0.22 25)",  // neon red
  "oklch(0.75 0.15 80)",  // yellow/gold
  "oklch(0.65 0.2 300)",  // purple
];

interface MarketOption {
  id: string;
  label: string;
  percentage: number;
  color: string;
}

interface MarketDetail {
  id: string;
  question: string;
  description: string;
  category: string;
  options: MarketOption[];
  totalPool: number;
  participants: number;
  endsAt: Date;
  resultAt?: Date;
  createdAt: Date;
  resolver: string;
  // 정산 관련
  authorId?: string;
  authorName?: string;
  winningOptionId?: string;
  /** 결과 확정 시각 (ISO) — DB `confirmed_at` */
  confirmedAt?: string;
  /** DB status — settled / refunded / cancelled 등 */
  status?: string;
}

// Mock market data - would come from API
const mockMarkets: Record<string, MarketDetail> = {
  "1": {
    id: "1",
    question: "다음 미국 대선의 최종 승자는 누구일까?",
    description:
      "이 보트는 2028년 미국 대통령 선거에서 최종 당선되는 후보자를 예측합니다. 공식 선거 결과 발표 후 정산됩니다.",
    category: "politics",
    options: [
      { id: "1a", label: "트럼프", percentage: 55, color: optionColors[0] },
      { id: "1b", label: "바이든", percentage: 45, color: optionColors[1] },
    ],
    totalPool: 1250000,
    participants: 8932,
    endsAt: new Date("2028-11-05"),
    createdAt: new Date("2025-01-01"),
    resolver: "공식 선거 결과",
  },
  "2": {
    id: "2",
    question: "삼성전자 이번 달 8만 전자 돌파할까?",
    description:
      "이 보트는 삼성전자(005930.KS) 주가가 이번 달 내에 80,000원을 돌파하는지 예측합니다. 장중 기준 한 번이라도 돌파하면 YES로 정산됩니다.",
    category: "stocks",
    options: [
      { id: "2a", label: "돌파한다", percentage: 38, color: optionColors[1] },
      { id: "2b", label: "못한다", percentage: 62, color: optionColors[2] },
    ],
    totalPool: 890000,
    participants: 1567,
    endsAt: new Date("2026-04-30"),
    createdAt: new Date("2026-04-01"),
    resolver: "한국거래소 공시",
  },
  "3": {
    id: "3",
    question: "비트코인 2026년 내 15만 달러 돌파?",
    description:
      "비트코인(BTC) 가격이 2026년 12월 31일 23:59 UTC 이전에 주요 거래소(바이낸스, 코인베이스, 크라켄)에서 $150,000 USD를 돌파하면 YES로 정산됩니다.",
    category: "crypto",
    options: [
      { id: "3a", label: "돌파", percentage: 67, color: optionColors[1] },
      { id: "3b", label: "미돌파", percentage: 33, color: optionColors[2] },
    ],
    totalPool: 2340000,
    participants: 4521,
    endsAt: new Date("2026-12-31"),
    createdAt: new Date("2025-01-15"),
    resolver: "가격 오라클",
  },
  "4": {
    id: "4",
    question: "2026 월드컵 우승국은?",
    description:
      "2026년 FIFA 월드컵 최종 우승국을 예측하는 보트입니다. 결승전 종료 후 공식 결과에 따라 정산됩니다.",
    category: "sports",
    options: [
      { id: "4a", label: "브라질", percentage: 28, color: optionColors[1] },
      { id: "4b", label: "아르헨티나", percentage: 25, color: optionColors[0] },
      { id: "4c", label: "프랑스", percentage: 22, color: optionColors[2] },
      { id: "4d", label: "기타", percentage: 25, color: optionColors[3] },
    ],
    totalPool: 3200000,
    participants: 12453,
    endsAt: new Date("2026-07-19"),
    createdAt: new Date("2025-06-01"),
    resolver: "FIFA 공식 결과",
  },
  "5": {
    id: "5",
    question: "이더리움 가격이 비트코인을 추월할까?",
    description:
      "이더리움(ETH)의 개당 가격이 비트코인(BTC)의 개당 가격을 추월하는지 예측합니다. 2027년 12월 31일까지 한 번이라도 추월하면 YES로 정산됩니다.",
    category: "crypto",
    options: [
      { id: "5a", label: "추월한다", percentage: 15, color: optionColors[1] },
      { id: "5b", label: "추월 못함", percentage: 85, color: optionColors[2] },
    ],
    totalPool: 567000,
    participants: 2341,
    endsAt: new Date("2027-12-31"),
    createdAt: new Date("2025-03-01"),
    resolver: "가격 오라클",
  },
  "6": {
    id: "6",
    question: "테슬라 주가 2026년 500달러 돌파?",
    description:
      "테슬라(TSLA) 주가가 2026년 내 $500 USD를 돌파하는지 예측합니다.",
    category: "stocks",
    options: [
      { id: "6a", label: "돌파", percentage: 42, color: optionColors[1] },
      { id: "6b", label: "미돌파", percentage: 58, color: optionColors[2] },
    ],
    totalPool: 1120000,
    participants: 892,
    endsAt: new Date("2026-12-31"),
    createdAt: new Date("2025-02-01"),
    resolver: "주가 오라클",
  },
  "7": {
    id: "7",
    question: "다음 한국 대통령 선거 당선자는?",
    description:
      "2027년 제21대 대한민국 대통령 선거의 최종 당선자를 예측합니다. 중앙선거관리위원회 공식 발표 기준으로 정산됩니다.",
    category: "politics",
    options: [
      { id: "7a", label: "여당 후보", percentage: 48, color: optionColors[0] },
      { id: "7b", label: "야당 후보", percentage: 47, color: optionColors[1] },
      { id: "7c", label: "제3후보", percentage: 5, color: optionColors[3] },
    ],
    totalPool: 4500000,
    participants: 15678,
    endsAt: new Date("2027-03-09"),
    createdAt: new Date("2025-01-01"),
    resolver: "중앙선거관리위원회",
  },
  "8": {
    id: "8",
    question: "OpenAI가 2026년 내 IPO 할까?",
    description:
      "OpenAI가 2026년 12월 31일 이전에 기업공개(IPO)를 완료하는지 예측합니다. 주요 증권거래소 상장 완료 시 YES로 정산됩니다.",
    category: "fun",
    options: [
      { id: "8a", label: "IPO 진행", percentage: 35, color: optionColors[1] },
      { id: "8b", label: "진행 안함", percentage: 65, color: optionColors[2] },
    ],
    totalPool: 780000,
    participants: 2345,
    endsAt: new Date("2026-12-31"),
    createdAt: new Date("2025-06-01"),
    resolver: "공식 공시",
  },
};

// Generate mock price history
function generatePriceHistory(basePrice: number, days: number = 30) {
  const data = [];
  let price = basePrice;
  const now = new Date();

  for (let i = days; i >= 0; i--) {
    const timestamp = new Date(now);
    timestamp.setDate(timestamp.getDate() - i);

    // Add some realistic volatility
    const change = (Math.random() - 0.5) * 8;
    price = Math.max(5, Math.min(95, price + change));

    data.push({
      timestamp,
      yesPrice: Math.round(price * 10) / 10,
      volume: Math.floor(Math.random() * 50000) + 10000,
    });
  }

  return data;
}

const categoryLabels: Record<string, string> = {
  crypto: "크립토",
  stocks: "주식",
  politics: "정치",
  sports: "스포츠",
  fun: "재미",
  game: "게임",
};

const categoryColors: Record<string, string> = {
  crypto: "bg-chart-4/20 text-chart-4 border-chart-4/30",
  stocks: "bg-neon-blue/20 text-neon-blue border-neon-blue/30",
  politics: "bg-chart-5/20 text-chart-5 border-chart-5/30",
  sports: "bg-neon-green/20 text-neon-green border-neon-green/30",
  fun: "bg-chart-3/20 text-chart-3 border-chart-3/30",
  game: "bg-chart-2/20 text-chart-2 border-chart-2/30",
};

function getTimeRemaining(date: Date): string {
  const now = new Date();
  const diff = date.getTime() - now.getTime();

  if (diff <= 0) return "종료됨";

  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  if (days > 30) {
    const months = Math.floor(days / 30);
    return `${months}개월 남음`;
  }
  if (days > 0) return `${days}일 ${hours}시간 남음`;
  return `${hours}시간 남음`;
}

/** DB 피드 API 응답 → 상세 페이지 모델 */
function feedWireToMarketDetail(w: BetFeedMarketWire): MarketDetail {
  return {
    id: w.id,
    question: w.question,
    description: "",
    category: w.category,
    options: w.options,
    totalPool: w.totalPool,
    participants: 0,
    endsAt: new Date(w.endsAt),
    resultAt: w.resultAt ? new Date(w.resultAt) : undefined,
    createdAt: w.createdAt ? new Date(w.createdAt) : new Date(),
    resolver: w.isOfficial ? "공식 경기·운영 기준" : "작성자·운영자 판단",
    authorId: w.creatorUserId ?? undefined,
    authorName: w.authorName ?? w.officialAuthorName,
    winningOptionId: w.winningOptionId,
    confirmedAt: w.confirmedAt,
    status: w.status,
    description: w.description ?? "",
    resolver: w.resolver ?? (w.isOfficial ? "공식 경기·운영 기준" : "작성자·운영자 판단"),
  };
}

/** UserMarket(localStorage)을 MarketDetail 형태로 변환 */
function userMarketToDetail(m: UserMarket): MarketDetail {
  return {
    id: m.id,
    question: m.question,
    description: m.description,
    category: m.category,
    options: m.options,
    totalPool: m.totalPool,
    participants: m.participants,
    endsAt: new Date(m.endsAt),
    resultAt: m.resultAt ? new Date(m.resultAt) : undefined,
    createdAt: new Date(m.createdAt),
    resolver: m.resolver,
    authorId: m.authorId,
    authorName: m.authorName,
    winningOptionId: m.winningOptionId,
    confirmedAt: m.confirmedAt,
  };
}

export default function MarketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const marketId = params.id as string;

  const listHref = useMemo(
    () => safeReturnPath(searchParams.get("next"), "/"),
    [searchParams],
  );

  const { userId, points: userBalance } = useUserPointsBalance();
  const { isAdmin } = useIsAdmin();

  const [authLoading, setAuthLoading] = useState(true);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  useEffect(() => {
    const supabase = createClient();
    supabase.auth
      .getSession()
      .then(({ data }) => {
        setIsLoggedIn(Boolean(data.session));
        setAuthLoading(false);
      })
      .catch(() => {
        setIsLoggedIn(false);
        setAuthLoading(false);
      });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsLoggedIn(Boolean(session));
      setAuthLoading(false);
    });
    return () => {
      sub.subscription.unsubscribe();
    };
  }, []);

  const [viewCount, setViewCount] = useState<number>(() => getMarketViews(marketId));
  useEffect(() => {
    setViewCount(incrementMarketViews(marketId));
    const sync = () => setViewCount(getMarketViews(marketId));
    window.addEventListener("voters:marketViewsUpdated", sync as EventListener);
    window.addEventListener("storage", sync as EventListener);
    return () => {
      window.removeEventListener("voters:marketViewsUpdated", sync as EventListener);
      window.removeEventListener("storage", sync as EventListener);
    };
  }, [marketId]);

  // 보트 데이터 (localStorage 업데이트 반영을 위해 state로 관리)
  const [marketData, setMarketData] = useState<MarketDetail | undefined>(() => {
    const mock = mockMarkets[marketId];
    if (mock) return mock;
    const um = getUserMarketById(marketId);
    return um ? userMarketToDetail(um) : undefined;
  });

  const [feedLoading, setFeedLoading] = useState(() => {
    if (mockMarkets[marketId]) return false;
    if (getUserMarketById(marketId)) return false;
    return isUuidString(marketId);
  });

  /** UUID 보트 API 실패 시 원인 표시(503 서비스롤·500 스키마 등) */
  const [detailLoadError, setDetailLoadError] = useState<{
    status: number;
    message: string;
    code?: string;
  } | null>(null);
  const [detailRetryToken, setDetailRetryToken] = useState(0);

  useEffect(() => {
    const mock = mockMarkets[marketId];
    if (mock) {
      setFeedLoading(false);
      setDetailLoadError(null);
      return;
    }
    const um = getUserMarketById(marketId);
    if (um) {
      setFeedLoading(false);
      setDetailLoadError(null);
      return;
    }
    if (!isUuidString(marketId)) {
      setFeedLoading(false);
      setDetailLoadError(null);
      return;
    }

    let cancelled = false;
    setFeedLoading(true);
    setDetailLoadError(null);

    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

    void (async () => {
      let lastStatus = 0;
      let lastBody: Record<string, unknown> = {};
      try {
        for (let attempt = 0; attempt < 4; attempt++) {
          if (cancelled) return;
          try {
            const res = await fetch(`/api/bets/${encodeURIComponent(marketId)}`, {
              credentials: "same-origin",
              cache: "no-store",
            });
            const j = (await res.json().catch(() => ({}))) as {
              ok?: boolean;
              market?: BetFeedMarketWire;
              optionTotals?: Record<string, number>;
              myOptionTotals?: Record<string, number>;
              error?: string;
              code?: string;
              message?: string;
            };
            lastStatus = res.status;
            lastBody = j as Record<string, unknown>;
            if (cancelled) return;
            if (res.ok && j?.ok && j.market) {
              setMarketData(feedWireToMarketDetail(j.market));
              if (j.optionTotals && typeof j.optionTotals === "object") {
                replaceBetsForMarketFromTotals(marketId, j.optionTotals);
                setBets(getBetsForMarket(marketId));
              }
              if (j.myOptionTotals && typeof j.myOptionTotals === "object") {
                setMyStakeByOption(j.myOptionTotals);
              }
              setDetailLoadError(null);
              return;
            }
          } catch {
            lastStatus = 0;
            lastBody = { error: "network_error" };
          }
          if (attempt < 3) await sleep(400);
        }
        if (!cancelled) {
          const msg =
            typeof lastBody.error === "string"
              ? lastBody.error
              : typeof lastBody.message === "string"
                ? lastBody.message
                : lastStatus === 0
                  ? "네트워크 오류"
                  : "보트 정보를 불러오지 못했습니다.";
          setDetailLoadError({
            status: lastStatus,
            message: msg,
            code: typeof lastBody.code === "string" ? lastBody.code : undefined,
          });
        }
      } finally {
        if (!cancelled) setFeedLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [marketId, detailRetryToken]);

  // localStorage 보트 업데이트 반영
  useEffect(() => {
    const onMarketsUpdated = () => {
      const um = getUserMarketById(marketId);
      if (um) setMarketData(userMarketToDetail(um));
    };
    window.addEventListener("voters:marketsUpdated", onMarketsUpdated);
    return () => window.removeEventListener("voters:marketsUpdated", onMarketsUpdated);
  }, [marketId]);

  const market = marketData;

  // ─── 정산 상태 ─────────────────────────────────────────────────────────────
  const [settleMode, setSettleMode] = useState(false);
  const [settling, setSettling] = useState(false);
  const [authorDisplayName, setAuthorDisplayName] = useState("");
  // 결과 확정 확인 다이얼로그용: 선택된 결과 옵션
  const [pendingSettleOption, setPendingSettleOption] = useState<MarketOption | null>(null);
  const [hoverSettleOptionId, setHoverSettleOptionId] = useState<string | null>(null);
  const [comments, setComments] = useState<MarketComment[]>([]);
  const [stakesRefreshToken, setStakesRefreshToken] = useState(0);
  const [bets, setBets] = useState<MarketBet[]>([]);
  /** DB bet_history 기준 내 선택지별 누적 (UUID 보트·로그인 시) */
  const [myStakeByOption, setMyStakeByOption] = useState<Record<string, number>>({});

  // 작성자 이름 (Supabase → display name)
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      const u = data?.user;
      if (!u) return;
      const name =
        u.user_metadata?.nickname ??
        u.user_metadata?.full_name ??
        u.user_metadata?.name ??
        u.email?.split("@")[0] ??
        "";
      setAuthorDisplayName(name);
    });
  }, [userId]);
  const likeTarget = useMemo(() => ({ type: "market" as const, id: marketId }), [marketId]);
  const [likeCount, setLikeCount] = useState<number>(0);
  const [liked, setLiked] = useState<boolean>(false);

  useEffect(() => {
    setLikeCount(getLikeCount(likeTarget));
    setLiked(hasLiked(likeTarget, userId));
  }, [likeTarget, userId]);

  useEffect(() => {
    const onLikesUpdated = () => {
      setLikeCount(getLikeCount(likeTarget));
      setLiked(hasLiked(likeTarget, userId));
    };
    window.addEventListener("voters:likesUpdated", onLikesUpdated as EventListener);
    window.addEventListener("storage", onLikesUpdated as EventListener);
    return () => {
      window.removeEventListener("voters:likesUpdated", onLikesUpdated as EventListener);
      window.removeEventListener("storage", onLikesUpdated as EventListener);
    };
  }, [likeTarget, userId]);

  const likesEarned = useMemo(() => {
    if (typeof window === "undefined") return 0;
    try {
      const raw = window.localStorage.getItem("voters.likes.rewards.v1");
      if (!raw) return 0;
      const all = JSON.parse(raw) as Record<string, number>;
      return (all[`market:${marketId}`] ?? 0) * 100;
    } catch {
      return 0;
    }
  }, [marketId]);

  useEffect(() => {
    setMyStakeByOption({});
    if (!isUuidString(marketId)) {
      setComments(getCommentsForMarket(marketId));
    } else {
      setComments([]);
    }
    setBets(getBetsForMarket(marketId));
  }, [marketId]);

  useEffect(() => {
    const onUpdated = () => {
      if (!isUuidString(marketId)) {
        setComments(getCommentsForMarket(marketId));
      }
      setBets(getBetsForMarket(marketId));
    };
    window.addEventListener("voters:marketCommentsUpdated", onUpdated as EventListener);
    window.addEventListener("voters:marketBetsUpdated", onUpdated as EventListener);
    window.addEventListener("storage", onUpdated as EventListener);
    return () => {
      window.removeEventListener("voters:marketCommentsUpdated", onUpdated as EventListener);
      window.removeEventListener("voters:marketBetsUpdated", onUpdated as EventListener);
      window.removeEventListener("storage", onUpdated as EventListener);
    };
  }, [marketId]);

  const derivedMarket = useMemo(() => {
    if (!market) {
      return {
        totalPool: 0,
        options: [] as { id: string; label: string; color: string; percentage: number; points: number }[],
      };
    }

    const betByOptionId = new Map<string, number>();
    for (const b of bets) {
      betByOptionId.set(b.optionId, (betByOptionId.get(b.optionId) ?? 0) + b.amount);
    }
    const stakeSum = [...betByOptionId.values()].reduce((acc, x) => acc + x, 0);

    const optionPoints = market.options.map((o) => {
      const fromBets = betByOptionId.get(o.id) ?? 0;
      if (stakeSum > 0) {
        return { ...o, points: Math.max(0, fromBets) };
      }
      const seeded = Math.round((market.totalPool * o.percentage) / 100);
      return { ...o, points: Math.max(0, seeded) };
    });

    const totalPool = optionPoints.reduce((acc, o) => acc + o.points, 0);
    const options = optionPoints.map((o) => ({
      id: o.id,
      label: o.label,
      color: o.color,
      percentage: totalPool > 0 ? Math.round(((o.points / totalPool) * 1000)) / 10 : 0,
      points: o.points,
    }));

    return { totalPool, options };
  }, [bets, market]);

  const optionLabelByIdDerived = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of derivedMarket.options) map.set(o.id, o.label);
    return map;
  }, [derivedMarket.options]);

  const betsByAuthor = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const b of bets) {
      const perAuthor = map.get(b.author) ?? new Map<string, number>();
      perAuthor.set(b.optionId, (perAuthor.get(b.optionId) ?? 0) + b.amount);
      map.set(b.author, perAuthor);
    }
    return map;
  }, [bets]);

  const myBetSummary = useMemo(() => {
    if (userId !== "anon" && isUuidString(marketId)) {
      const entries = Object.entries(myStakeByOption)
        .map(([optId, v]) => [optId, v] as [string, number])
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1]);
      const total = entries.reduce((acc, [, v]) => acc + v, 0);
      return { entries, total };
    }
    const per = betsByAuthor.get(userId) ?? new Map<string, number>();
    const entries = Array.from(per.entries())
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((acc, [, v]) => acc + v, 0);
    return { entries, total };
  }, [betsByAuthor, userId, myStakeByOption, marketId]);

  if (feedLoading && !market) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar balance={userBalance} userId={userId} />
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <p className="text-muted-foreground">보트 불러오는 중…</p>
        </div>
      </div>
    );
  }

  if (!market && detailLoadError) {
    const isServiceRole = detailLoadError.code === "SERVICE_ROLE_CONFIG" || detailLoadError.status === 503;
    const isNotFound = detailLoadError.status === 404;
    return (
      <div className="min-h-screen bg-background">
        <Navbar balance={userBalance} userId={userId} />
        <div className="flex flex-col items-center justify-center py-24 px-4 text-center max-w-lg mx-auto">
          <h1 className="text-2xl font-bold text-foreground mb-2">
            {isNotFound ? "보트를 찾을 수 없습니다" : "보트를 불러오지 못했습니다"}
          </h1>
          <p className="text-muted-foreground mb-4 text-sm leading-relaxed">
            {isServiceRole ? (
              <>
                서버에 <code className="text-xs bg-secondary px-1 rounded">SUPABASE_SERVICE_ROLE_KEY</code>가 없거나 잘못되었습니다.
                로컬에서는 <code className="text-xs bg-secondary px-1 rounded">.env.local</code>에 넣은 뒤 개발 서버를 다시 시작해 주세요.
              </>
            ) : isNotFound ? (
              <>
                DB에 해당 ID의 보트가 없습니다. 방금 만든 보트라면 잠시 후{" "}
                <button
                  type="button"
                  className="text-neon-blue hover:underline"
                  onClick={() => setDetailRetryToken((n) => n + 1)}
                >
                  다시 시도
                </button>
                하거나 새로고침해 보세요.
              </>
            ) : (
              <>
                {detailLoadError.message}
                {detailLoadError.code ? (
                  <span className="block mt-2 text-xs opacity-80">코드: {detailLoadError.code}</span>
                ) : null}
              </>
            )}
          </p>
          <div className="flex flex-wrap gap-3 justify-center">
            <button
              type="button"
              onClick={() => setDetailRetryToken((n) => n + 1)}
              className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-secondary"
            >
              다시 불러오기
            </button>
            <button
              type="button"
              onClick={() => router.push(listHref)}
              className="text-neon-blue hover:underline text-sm"
            >
              홈으로
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!market) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar balance={userBalance} userId={userId} />
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">
            보트를 찾을 수 없습니다
          </h1>
          <p className="text-muted-foreground mb-6">
            요청하신 보트가 존재하지 않습니다.
          </p>
          <button
            type="button"
            onClick={() => router.push(listHref)}
            className="text-neon-blue hover:underline"
          >
            보트 목록으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  const handlePlaceBet = async (
    bets: { optionId: string; amount: number }[],
  ): Promise<boolean> => {
    let syncedFromServer = false;
    try {
      const res = await fetch("/api/place-bet", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ marketId, bets }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        remainingBalance?: number | null;
        optionTotals?: Record<string, number>;
        myOptionTotals?: Record<string, number>;
        message?: string;
        error?: string;
      };

      if (!res.ok || !json?.ok) {
        toast.error("참여 실패", {
          description: json?.message ?? json?.error ?? "처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.",
        });
        return false;
      }

      // ── 잔액 즉시 반영 (remaining_balance 있으면 바로, 없으면 서버 재조회) ──
      if (typeof json.remainingBalance === "number" && userId && userId !== "anon") {
        setUserPoints(userId, json.remainingBalance);
      } else {
        void refreshPebblesFromServer(userId);
      }

      if (json.optionTotals && typeof json.optionTotals === "object") {
        replaceBetsForMarketFromTotals(marketId, json.optionTotals);
        setBets(getBetsForMarket(marketId));
        const pool = Object.values(json.optionTotals).reduce((a, x) => a + x, 0);
        setMarketData((prev) => (prev ? { ...prev, totalPool: pool } : prev));
        syncedFromServer = true;
      }
      if (json.myOptionTotals && typeof json.myOptionTotals === "object") {
        setMyStakeByOption(json.myOptionTotals);
      }

      toast.success("참여 완료!", {
        description: "보트 참여가 성공적으로 완료되었습니다.",
      });
    } catch {
      toast.error("네트워크 오류", {
        description: "네트워크 오류로 처리할 수 없습니다. 잠시 후 다시 시도해주세요.",
      });
      return false;
    }

    if (!syncedFromServer) {
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const uid =
        session?.user?.id && session.user.id !== "anon"
          ? session.user.id
          : userId;
      for (const leg of bets) {
        const next = addMarketBet(
          marketId,
          leg.optionId,
          leg.amount,
          authorDisplayName || "익명",
          uid,
        );
        if (next) setBets((prev) => [...prev, next]);
      }
    }

    window.dispatchEvent(new Event("voters:feedBetsMaybeStale"));
    if (isUuidString(marketId)) {
      setStakesRefreshToken((x) => x + 1);
    }
    return true;
  };

  // ─── 정산 핸들러 ───────────────────────────────────────────────────────────
  const handleSettle = async (winningOptionId: string) => {
    if (!market || settling) return;

    const realPool = bets.reduce((acc, b) => acc + b.amount, 0);
    const { adminFee, creatorFee } = calculateFees(realPool);

    setSettling(true);
    let wasNoContest = false;
    try {
      if (isUuidString(marketId)) {
        const res = await fetch(`/api/bets/${marketId}/settle`, {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ winningOptionId }),
        });
        const j = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          confirmedAt?: string;
          message?: string;
          noContest?: boolean;
        };
        if (!res.ok || !j?.ok) {
          window.alert(
            j?.message ??
              j?.error ??
              "결과를 저장하지 못했습니다. Supabase에 winning_option_id·confirmed_at 컬럼 적용 여부를 확인해 주세요.",
          );
          return;
        }
        const confirmedAtIso = j.confirmedAt ?? new Date().toISOString();
        wasNoContest = !!j.noContest;
        if (wasNoContest) {
          // 반대쪽 베팅 없음 — 서버에서 전액 환불 완료
          setMarketData((prev) =>
            prev
              ? { ...prev, winningOptionId, confirmedAt: confirmedAtIso, status: "refunded" }
              : prev,
          );
          void refreshPebblesFromServer(userId);
        } else {
          setMarketData((prev) =>
            prev
              ? { ...prev, winningOptionId, confirmedAt: confirmedAtIso }
              : prev,
          );
        }
      } else {
        const um = getUserMarketById(marketId);
        const confirmedAtIso = new Date().toISOString();
        if (um) {
          updateUserMarket({
            ...um,
            winningOptionId,
            confirmedAt: confirmedAtIso,
            adminFeeCollected: adminFee,
            creatorFeeCollected: creatorFee,
          });
        }
        setMarketData((prev) =>
          prev
            ? { ...prev, winningOptionId, confirmedAt: confirmedAtIso }
            : prev,
        );
      }

      const isCreator = market.authorId && market.authorId === userId;
      // noContest(전액 환불)일 때는 창작자 수수료 없음
      if (isCreator && creatorFee > 0 && !wasNoContest) {
        void earnUserPoints(userId, creatorFee, `🏆 보트 창작자 페블 — ${market.question.slice(0, 20)}…`).then(() =>
          refreshPebblesFromServer(userId),
        );
      }

      setSettleMode(false);
      setPendingSettleOption(null);
      window.dispatchEvent(new Event("voters:feedBetsMaybeStale"));
    } finally {
      setSettling(false);
    }
  };

  // ─── 배당금 / 정산 계산 (bets 선언 이후) ─────────────────────────────────
  const winningOptionId = market?.winningOptionId;
  const isRefunded = market?.status === "refunded";
  const isSettled = !!winningOptionId && !isRefunded;
  const realPool = bets.reduce((acc, b) => acc + b.amount, 0);

  const myWinningBets = winningOptionId
    ? (myStakeByOption[winningOptionId] ??
      getUserBetsOnOption(marketId, winningOptionId, userId))
    : 0;

  const totalWinningBets = winningOptionId
    ? bets.filter((b) => b.optionId === winningOptionId).reduce((acc, b) => acc + b.amount, 0)
    : 0;

  const { dividendPool } = calculateFees(realPool);
  const myPayout = calculateUserPayout(myWinningBets, totalWinningBets, dividendPool);
  const alreadyClaimed = isSettled ? hasClaimedWinnings(userId, marketId) : false;
  const canClaim = isSettled && myWinningBets > 0 && myPayout > 0 && !alreadyClaimed && userId !== "anon";

  const handleClaim = () => {
    if (!canClaim) return;
    void (async () => {
      await earnUserPoints(userId, myPayout, `🎉 보트 페블 보상 수령 — ${market?.question?.slice(0, 20) ?? ""}…`);
      await refreshPebblesFromServer(userId);
      markWinningsClaimed(userId, marketId);
    })();
  };

  // 베팅 마감 시간이 지났는지 여부 (창작자 정산 가능 조건)
  const bettingClosed = market ? new Date() >= market.endsAt : false;

  // 정산 권한: 운영자(시간 무관) 또는 창작자(베팅 마감 이후)
  const canSettle = !isSettled && (
    isAdmin ||
    (market?.authorId === userId && userId !== "anon" && bettingClosed)
  );

  return (
    <div className="min-h-screen bg-background">
      <Navbar balance={userBalance} userId={userId} />

      <main className="px-4 md:px-6 py-6">
        <div className="grid grid-cols-1 xl:grid-cols-[10%_minmax(0,1fr)_10%] gap-6">
          {/* Left Ad Space */}
          <aside className="hidden xl:block">
            <div className="h-full rounded-xl border border-border/40 bg-secondary/10" />
          </aside>

          {/* Content */}
          <div className="min-w-0">
            {/* Back Button + 운영자 관리 버튼 */}
            <div className="flex items-center justify-between mb-6">
              <button
                type="button"
                onClick={() => router.push(listHref)}
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="size-4" />
                <span className="text-sm">보트 목록으로</span>
              </button>
              {isAdmin && (
                <Link
                  href={`/admin/betting/${marketId}`}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-chart-5/40 text-chart-5 hover:bg-chart-5/10 transition-colors font-medium"
                >
                  <ExternalLink className="size-3.5" />
                  관리자 상세 페이지
                </Link>
              )}
            </div>

            {/* Two Column Layout */}
            <div className="flex flex-col lg:flex-row gap-6 items-stretch">
              {/* Left Column - 70% */}
              <div className="flex-1 lg:w-[70%] space-y-6">
                {/* Market Header */}
                <div className="bg-card rounded-xl border border-border/50 p-5 md:p-6">
              <div className="flex items-start gap-3 mb-4">
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs font-medium",
                    categoryColors[market.category]
                  )}
                >
                  {categoryLabels[market.category]}
                </Badge>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Clock className="size-3.5" />
                  <span>{getTimeRemaining(market.endsAt)}</span>
                </div>
              </div>

              <div className="flex items-start justify-between gap-3 mb-4">
                <h1 className="min-w-0 flex-1 text-xl md:text-2xl lg:text-3xl font-bold text-foreground leading-tight text-balance">
                  {market.question}
                </h1>
                {/* 좋아요 · 싫어요 · 신고 버튼 그룹 */}
                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 border transition-colors text-sm font-semibold",
                      liked
                        ? "bg-neon-red/10 text-neon-red border-neon-red/20"
                        : "bg-secondary/30 text-muted-foreground border-border/50 hover:bg-secondary/60"
                    )}
                    onClick={() => {
                      const next = toggleLike(likeTarget, userId);
                      setLikeCount(next.count);
                      setLiked(next.liked);
                      // 보트 창작자에게 좋아요 10개당 100P 지급
                      if (market.authorId && market.authorId !== "anon") {
                        void checkAndGrantLikeReward(
                          market.authorId,
                          `market:${marketId}`,
                          next.count,
                        );
                      }
                    }}
                    aria-label="좋아요"
                    title="좋아요"
                  >
                    <ThumbsUp className={cn("size-4", liked ? "fill-current" : "")} />
                    <span>{likeCount}</span>
                  </button>
                  <DislikeButton
                    targetType="boat"
                    targetId={marketId}
                    canDislike={userId !== "anon"}
                  />
                  <ReportButton
                    targetType="boat"
                    targetId={marketId}
                    canReport={userId !== "anon"}
                  />
                </div>
              </div>

              {/* 마감까지 남은 시간 (초 단위 실시간 카운트다운) */}
              <CountdownTimer
                closingAt={market.endsAt}
                confirmedAt={market.resultAt ?? market.endsAt}
                className="mb-3"
              />

              {market.description && (
                <p className="text-sm text-muted-foreground mb-4 whitespace-pre-line leading-relaxed">
                  {market.description}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground pt-4 border-t border-border/50">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="size-4" />
                  <span className="font-medium text-foreground">
                    {derivedMarket.totalPool.toLocaleString()} P
                  </span>
                  <span>거래량</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Users className="size-4" />
                  <span>{market.participants.toLocaleString()}명 참여</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Eye className="size-4" />
                  <span>{viewCount.toLocaleString()} 조회</span>
                </div>
                {/* 마감 일시 (KST) */}
                <div className="flex items-center gap-1.5">
                  <Clock className="size-3.5" />
                  <span>
                    마감&nbsp;
                    {market.endsAt.toLocaleString("ko-KR", {
                      timeZone: "Asia/Seoul",
                      year: "numeric", month: "2-digit", day: "2-digit",
                      hour: "2-digit", minute: "2-digit",
                    })} KST
                  </span>
                </div>
                {/* 결과 발표 일시 (KST, 설정된 경우만) */}
                {market.resultAt && (
                  <div className="flex items-center gap-1.5 text-chart-5">
                    <ExternalLink className="size-3.5" />
                    <span>
                      결과 발표&nbsp;
                      {market.resultAt.toLocaleString("ko-KR", {
                        timeZone: "Asia/Seoul",
                        year: "numeric", month: "2-digit", day: "2-digit",
                        hour: "2-digit", minute: "2-digit",
                      })} KST
                    </span>
                  </div>
                )}
                {market.resolver && (
                  <div className="flex items-center gap-1.5">
                    <ExternalLink className="size-3.5" />
                    <span>정산: {market.resolver}</span>
                  </div>
                )}
              </div>
            </div>

                {/* ─── 전액 환불 배너 ─────────────────────────────────────── */}
                {isRefunded && (
                  <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 p-4 space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">💸</span>
                      <span className="font-bold text-foreground">전액 환불 처리 완료</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      반대쪽 베팅 참여자가 없어 모든 베팅 금액이 자동으로 전액 환불되었습니다.
                    </p>
                    {(() => {
                      const myTotal = Object.values(myStakeByOption).reduce((a, b) => a + b, 0);
                      return myTotal > 0 ? (
                        <p className="text-sm font-semibold text-blue-400">
                          내 환불 금액: {myTotal.toLocaleString()} P
                        </p>
                      ) : null;
                    })()}
                  </div>
                )}

                {/* ─── 정산 완료 배너 ─────────────────────────────────────── */}
                {isSettled && (() => {
                  const winOption = market.options.find(o => o.id === winningOptionId);
                  const winIdx = winOption
                    ? market.options.findIndex((o) => o.id === winOption.id)
                    : -1;
                  const winAccent = winOption
                    ? resolveOptionColor(winOption.color, winIdx >= 0 ? winIdx : 0)
                    : undefined;
                  const { adminFee, creatorFee, dividendPool } = calculateFees(realPool);
                  return (
                    <div
                      className="rounded-xl border p-4 space-y-3 transition-colors duration-200"
                      style={{
                        borderColor: winAccent ? accentMutedBorder(winAccent) : undefined,
                        background: winAccent
                          ? `linear-gradient(135deg, ${accentMutedBackground(winAccent)}, transparent)`
                          : undefined,
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <Trophy className="size-5 text-yellow-400" />
                        <span className="font-bold text-foreground">보트 정산 완료</span>
                        {winOption && winAccent && (
                          <span
                            className="text-sm font-semibold px-2 py-0.5 rounded-full transition-colors duration-200"
                            style={{
                              backgroundColor: accentMutedBackground(winAccent),
                              color: winAccent,
                            }}
                          >
                            {myPayout > 0
                              ? `${myPayout.toLocaleString()}P 획득`
                              : `${winOption.label} 획득`}
                          </span>
                        )}
                      </div>

                      {/* 페블 배분 내역 */}
                      {realPool > 0 && (
                        <div className="grid grid-cols-3 gap-2 text-center text-xs">
                          <div className="rounded-lg bg-secondary/40 px-1 py-2 sm:px-2">
                            <p className="text-muted-foreground">운영자</p>
                            <p className="font-bold text-foreground mt-0.5 tabular-nums">{adminFee.toLocaleString()} P</p>
                          </div>
                          <div className="rounded-lg bg-secondary/40 px-1 py-2 sm:px-2">
                            <p className="text-muted-foreground">창작자</p>
                            <p className="font-bold text-foreground mt-0.5 tabular-nums">{creatorFee.toLocaleString()} P</p>
                          </div>
                          <div className="rounded-lg bg-secondary/40 px-1 py-2 sm:px-2">
                            <p className="text-muted-foreground">보상 풀</p>
                            <p className="font-bold text-foreground mt-0.5 tabular-nums">{dividendPool.toLocaleString()} P</p>
                          </div>
                        </div>
                      )}

                      {/* 페블 보상 수령 버튼 */}
                      {canClaim && (
                        <button
                          type="button"
                          onClick={handleClaim}
                          className="w-full py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors duration-200"
                          style={{
                            backgroundColor: winAccent ?? "var(--chart-5)",
                            color: winAccent ? pickReadableTextOnAccent(winAccent) : "#ffffff",
                            boxShadow: winAccent ? `0 4px 16px ${accentMutedBorder(winAccent)}` : undefined,
                          }}
                        >
                          <Award className="size-4" />
                          페블 보상 수령 — {myPayout.toLocaleString()} P
                        </button>
                      )}
                      {isSettled && myWinningBets > 0 && alreadyClaimed && (
                        <div className="text-center text-sm text-muted-foreground flex items-center justify-center gap-1.5">
                          <Award className="size-4 text-green-500" />
                          페블 보상 수령 완료
                        </div>
                      )}
                      {isSettled && myWinningBets === 0 && userId !== "anon" && (
                        <div className="text-center text-sm text-muted-foreground">
                          이번 보트에서 결과 선택지에 참여하지 않았습니다.
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* ─── 정산 패널 (운영자 / 창작자) ─────────────────────────── */}
                {/* 창작자에게 결과 발표 시간 전 안내 */}
                {!isSettled && market?.authorId === userId && userId !== "anon" && !bettingClosed && (
                  <div className="rounded-xl border border-border/40 bg-secondary/10 p-4 flex items-start gap-3">
                    <Clock className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-foreground">결과 입력 대기 중</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        참여 마감 시간({market.endsAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })} KST) 이후에 결과를 입력할 수 있습니다.
                      </p>
                    </div>
                  </div>
                )}

                {canSettle && (
                  <div
                    className="rounded-xl border border-chart-5/30 bg-card overflow-hidden"
                    style={{ boxShadow: "0 0 20px color-mix(in oklch, var(--chart-5) 8%, transparent)" }}
                  >
                    <button
                      type="button"
                      onClick={() => setSettleMode((v) => !v)}
                      className={cn(
                        "group relative isolate flex w-full items-center justify-start gap-3 overflow-hidden px-4 py-3.5 text-left transition-[box-shadow] duration-300",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-500/55 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                        settleMode &&
                          "shadow-[inset_0_1px_0_0_color-mix(in_oklch,var(--border)_50%,transparent)]",
                      )}
                    >
                      <span
                        className="pointer-events-none absolute inset-0 -z-10 origin-left scale-x-0 bg-gradient-to-r from-violet-500/30 via-purple-500/22 to-fuchsia-500/14 transition-transform duration-500 ease-out group-hover:scale-x-100"
                        aria-hidden
                      />
                      <div className="relative flex min-w-0 flex-1 flex-wrap items-center gap-2">
                        <Trophy className="size-4 shrink-0 text-chart-5" />
                        <span className="text-sm font-semibold text-foreground">결과 입력</span>
                        <span className="text-xs text-muted-foreground">
                          {isAdmin && market?.authorId !== userId ? "(운영자)" : "(창작자)"}
                        </span>
                        <span className="hidden text-xs text-muted-foreground sm:inline">
                          {settleMode ? "· 영역을 눌러 접기" : "· 영역을 눌러 펼치기"}
                        </span>
                      </div>
                    </button>

                    {settleMode && (
                      <div className="space-y-3 border-t border-border/40 bg-card px-4 pb-4 pt-3">
                        {/* 수수료 미리보기 */}
                        {realPool > 0 && (() => {
                          const { adminFee, creatorFee, dividendPool } = calculateFees(realPool);
                          const isCreator = market.authorId === userId;
                          return (
                            <div className="rounded-lg bg-secondary/20 px-3 py-3 space-y-2">
                              <p className="text-xs text-muted-foreground font-medium">참여 풀: {realPool.toLocaleString()} P</p>
                              <div className="grid grid-cols-3 gap-1.5 text-center text-xs">
                                <div className="rounded-lg bg-secondary/40 px-1 py-1.5">
                                  <p className="text-muted-foreground">운영자</p>
                                  <p className="font-bold tabular-nums">{adminFee.toLocaleString()} P</p>
                                </div>
                                <div className={cn("rounded-lg px-1 py-1.5", isCreator ? "bg-chart-5/10" : "bg-secondary/40")}>
                                  <p className="text-muted-foreground">창작자</p>
                                  <p className={cn("font-bold tabular-nums", isCreator ? "text-chart-5" : "")}>{creatorFee.toLocaleString()} P</p>
                                </div>
                                <div className="rounded-lg bg-secondary/40 px-1 py-1.5">
                                  <p className="text-muted-foreground">보상 풀</p>
                                  <p className="font-bold tabular-nums">{dividendPool.toLocaleString()} P</p>
                                </div>
                              </div>
                              {isCreator && (
                                <p className="text-xs text-chart-5 text-center">
                                  ✓ 결과 확정 시 창작자 페블 {creatorFee.toLocaleString()} P가 즉시 지급됩니다
                                </p>
                              )}
                            </div>
                          );
                        })()}

                        <p className="text-xs text-muted-foreground">결과 선택지를 선택하세요:</p>
                        <div
                          className={cn(
                            "grid gap-2",
                            market.options.length === 2
                              ? "grid-cols-2"
                              : market.options.length === 3
                                ? "grid-cols-1 sm:grid-cols-3"
                                : market.options.length === 4
                                  ? "grid-cols-2"
                                  : "grid-cols-1 sm:grid-cols-2",
                          )}
                        >
                          {market.options.map((opt, optIdx) => {
                            const accent = resolveOptionColor(opt.color, optIdx);
                            const emphasized = hoverSettleOptionId === opt.id;
                            return (
                              <button
                                key={opt.id}
                                type="button"
                                onClick={() => setPendingSettleOption(opt)}
                                disabled={settling}
                                onMouseEnter={() => setHoverSettleOptionId(opt.id)}
                                onMouseLeave={() => setHoverSettleOptionId(null)}
                                className="py-3 px-3 rounded-xl text-sm font-semibold border-2 transition-colors duration-200 hover:scale-[1.02]"
                                style={{
                                  backgroundColor: emphasized ? accent : accentMutedBackground(accent),
                                  borderColor: emphasized ? accent : accentMutedBorder(accent),
                                  color: emphasized ? pickReadableTextOnAccent(accent) : "#334155",
                                }}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ─── 결과 확정 확인 다이얼로그 ───────────────────────────── */}
                {pendingSettleOption && (() => {
                  const opt = pendingSettleOption;
                  const optIdx = market.options.findIndex((o) => o.id === opt.id);
                  const accent = resolveOptionColor(opt.color, optIdx >= 0 ? optIdx : 0);
                  const { creatorFee } = calculateFees(realPool);
                  const isCreator = market.authorId === userId;
                  const totalEarnings = isCreator ? (likesEarned + creatorFee) : likesEarned;
                  return (
                    <div
                      className="fixed inset-0 z-50 flex items-center justify-center p-4"
                      onClick={() => setPendingSettleOption(null)}
                    >
                      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                      <div
                        className="relative w-full max-w-sm rounded-2xl border shadow-2xl overflow-hidden transition-colors duration-200"
                        style={{
                          borderColor: accentMutedBorder(accent),
                          boxShadow: `0 0 40px ${accentMutedBackground(accent)}`,
                        }}
                        onClick={e => e.stopPropagation()}
                      >
                        {/* 상단 색상 띠 */}
                        <div className="h-1.5 w-full transition-colors duration-200" style={{ backgroundColor: accent }} />

                        <div className="bg-card/95 backdrop-blur-md p-6 space-y-5">
                          {/* 닫기 */}
                          <button onClick={() => setPendingSettleOption(null)}
                            className="absolute top-4 right-4 p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors">
                            <X className="size-4" />
                          </button>

                          {/* 헤더 */}
                          <div className="pr-6">
                            <div className="flex items-center gap-2 mb-1">
                              <Trophy className="size-4 text-yellow-400" />
                              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">결과 확정</span>
                            </div>
                            <p className="text-sm font-medium text-foreground line-clamp-2 leading-snug">
                              {market.question}
                            </p>
                          </div>

                          {/* 선택한 결과 항목 */}
                          <div
                            className="rounded-xl border px-4 py-3 space-y-1 transition-colors duration-200"
                            style={{
                              borderColor: accentMutedBorder(accent),
                              backgroundColor: accentMutedBackground(accent),
                            }}
                          >
                            <p className="text-[11px] text-muted-foreground">결과 선택지</p>
                            <p className="text-xl font-bold transition-colors duration-200" style={{ color: accent }}>
                              {opt.label}
                            </p>
                          </div>

                          {/* 수익 요약 */}
                          {isCreator && (
                            <div className="rounded-xl border border-border/40 bg-secondary/20 p-3 space-y-2">
                              <div className="flex items-center gap-1.5 mb-1">
                                <Coins className="size-3.5 text-amber-400" />
                                <p className="text-xs font-semibold text-foreground">이 보트로 얻은 수익</p>
                              </div>
                              <div className="space-y-1.5 text-xs">
                                <div className="flex items-center justify-between">
                                  <span className="text-muted-foreground">👍 좋아요 수익</span>
                                  <span className="font-semibold text-foreground">{likesEarned.toLocaleString()} P</span>
                                </div>
                                <div className="flex items-center justify-between">
                                  <span className="text-muted-foreground">🏆 창작자 페블 (5%)</span>
                                  <span className="font-semibold text-chart-5">{creatorFee.toLocaleString()} P</span>
                                </div>
                                <div className="flex items-center justify-between pt-1.5 border-t border-border/30">
                                  <span className="font-semibold text-foreground">합계</span>
                                  <span className="font-bold text-chart-5 text-sm">{totalEarnings.toLocaleString()} P</span>
                                </div>
                              </div>
                              {creatorFee > 0 && (
                                <p className="text-[11px] text-muted-foreground">
                                  * 창작자 페블 {creatorFee.toLocaleString()} P는 확정 즉시 지급됩니다
                                </p>
                              )}
                            </div>
                          )}

                          <p className="text-xs text-muted-foreground text-center">
                            확정 후에는 취소할 수 없습니다.
                          </p>

                          {/* 버튼 */}
                          <div className="flex gap-2">
                            <button onClick={() => setPendingSettleOption(null)}
                              className="flex-1 py-2.5 rounded-xl border border-border/50 bg-secondary/50 hover:bg-secondary text-sm font-semibold text-muted-foreground transition-colors">
                              취소
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleSettle(opt.id)}
                              disabled={settling}
                              className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition-colors duration-200 disabled:opacity-50"
                              style={{
                                backgroundColor: accent,
                                color: pickReadableTextOnAccent(accent),
                                boxShadow: `0 4px 16px ${accentMutedBorder(accent)}`,
                              }}
                            >
                              <CheckCircle2 className="size-4" />
                              결과 확정
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Chart + Comments (Desktop: split half/half) */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
                  <div className="bg-card rounded-xl border border-border/50 p-5 md:p-6 lg:min-h-[620px]">
                    <OddsPoolChart options={derivedMarket.options} totalPool={derivedMarket.totalPool} className="h-full" />
                  </div>

                  <div className="bg-card rounded-xl border border-border/50 p-5 md:p-6 lg:min-h-[620px] flex flex-col">
                    <BoatCommentsSection
                      marketId={marketId}
                      options={derivedMarket.options.map((o) => ({
                        id: o.id,
                        label: o.label,
                        color: o.color,
                      }))}
                      supabaseMode={isUuidString(marketId)}
                      refreshStakesToken={stakesRefreshToken}
                      localComments={comments}
                      localBets={bets}
                      onLocalAddComment={(text) => {
                        const next = addMarketComment(marketId, text);
                        if (next) setComments(getCommentsForMarket(marketId));
                      }}
                    />
                  </div>
                </div>

                {/* Bet Panel - Mobile/Tablet */}
                <div className="lg:hidden bg-card rounded-xl border border-border/50 p-5 md:p-6">
                  <h2 className="text-lg font-semibold text-foreground mb-4">
                    보트하기
                  </h2>
                  {authLoading ? (
                    <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                      로딩 중...
                    </div>
                  ) : !isLoggedIn ? (
                    <div className="rounded-xl border border-border/50 bg-chart-5/5 px-4 py-5 text-center">
                      <p className="text-sm font-semibold text-foreground">
                        🔒 로그인 이후 이용 가능합니다.
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        로그인하면 찬성/반대 선택과 보트하기를 사용할 수 있어요.
                      </p>
                      <Link
                        href="/login"
                        className="mt-4 inline-flex items-center justify-center rounded-xl bg-chart-5 px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-chart-5/90 transition-colors"
                      >
                        로그인하러 가기
                      </Link>
                    </div>
                  ) : isAdmin ? (
                    <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                      운영자는 보트에 참여할 수 없습니다
                    </div>
                  ) : market?.authorId && market.authorId === userId ? (
                    <div className="rounded-xl border border-border/50 bg-secondary/10 px-4 py-6 text-center">
                      <p className="text-sm font-semibold text-foreground">🚫 자신이 만든 보트입니다</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        보트 창작자는 자신의 보트에 참여할 수 없습니다.
                      </p>
                    </div>
                  ) : (
                    <BetPanel
                      options={derivedMarket.options}
                      userBalance={userBalance}
                      existingStakeOnMarket={myBetSummary.total}
                      onPlaceBet={handlePlaceBet}
                      marketQuestion={market.question}
                    />
                  )}
                </div>
              </div>

              {/* Right Column - 30% */}
              <div className="lg:w-[30%] space-y-6">
                {/* Bet Panel - Desktop */}
                <div className="hidden lg:block bg-card rounded-xl border border-border/50 p-5 lg:min-h-[620px] flex flex-col">
                  <h2 className="text-lg font-semibold text-foreground mb-4">
                    보트하기
                  </h2>
                  <div className="mb-4 rounded-lg border border-border/50 bg-secondary/10 px-4 py-3">
                    <div className="text-xs text-muted-foreground">내 보트 페블</div>
                    {myBetSummary.total <= 0 ? (
                      <div className="mt-1 text-sm text-muted-foreground">아직 걸린 페블이 없습니다.</div>
                    ) : (
                      <div className="mt-2 space-y-1">
                        <div className="text-sm font-semibold text-foreground">
                          총 {myBetSummary.total.toLocaleString()} P
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {myBetSummary.entries
                            .slice(0, 3)
                            .map(([optId, amt]) => `${optionLabelByIdDerived.get(optId) ?? optId} ${amt.toLocaleString()}P`)
                            .join(" · ")}
                        </div>
                      </div>
                    )}
                  </div>
                  {authLoading ? (
                    <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                      로딩 중...
                    </div>
                  ) : !isLoggedIn ? (
                    <div className="rounded-xl border border-border/50 bg-chart-5/5 px-4 py-6 text-center">
                      <p className="text-sm font-semibold text-foreground">
                        🔒 로그인 이후 이용 가능합니다.
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        로그인하면 찬성/반대 선택과 보트하기를 사용할 수 있어요.
                      </p>
                      <Link
                        href="/login"
                        className="mt-4 inline-flex items-center justify-center rounded-xl bg-chart-5 px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-chart-5/90 transition-colors"
                      >
                        로그인하러 가기
                      </Link>
                    </div>
                  ) : isAdmin ? (
                    <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
                      운영자는 보트에 참여할 수 없습니다
                    </div>
                  ) : market?.authorId && market.authorId === userId ? (
                    <div className="rounded-xl border border-border/50 bg-secondary/10 px-4 py-6 text-center">
                      <p className="text-sm font-semibold text-foreground">🚫 자신이 만든 보트입니다</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        보트 창작자는 자신의 보트에 참여할 수 없습니다.
                      </p>
                    </div>
                  ) : (
                    <BetPanel
                      options={derivedMarket.options}
                      userBalance={userBalance}
                      existingStakeOnMarket={myBetSummary.total}
                      onPlaceBet={handlePlaceBet}
                      marketQuestion={market.question}
                    />
                  )}
                </div>
              </div>
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
