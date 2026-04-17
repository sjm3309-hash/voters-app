"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Award, CheckCircle2, Clock, Coins, ExternalLink, Eye, Heart, TrendingUp, Trophy, Users, X } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { Badge } from "@/components/ui/badge";
import { OddsPoolChart } from "@/components/odds-pool-chart";
import { BetPanel } from "@/components/bet-panel";
import { CountdownTimer } from "@/components/CountdownTimer";
import { cn } from "@/lib/utils";
import { getLikeCount, hasLiked, toggleLike } from "@/lib/likes";
import { addMarketComment, getCommentsForMarket, type MarketComment } from "@/lib/market-comments";
import { addMarketBet, getBetsForMarket, getUserBetsOnOption, type MarketBet } from "@/lib/market-bets";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { earnUserPoints, spendUserPoints, useUserPointsBalance } from "@/lib/points";
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
  settledAt?: string;
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
    settledAt: m.settledAt,
  };
}

export default function MarketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const marketId = params.id as string;

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
  // 결과 확정 확인 다이얼로그용: 선택된 당첨 옵션
  const [pendingSettleOption, setPendingSettleOption] = useState<MarketOption | null>(null);

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
            onClick={() => router.push("/")}
            className="text-neon-blue hover:underline"
          >
            보트 목록으로 돌아가기
          </button>
        </div>
      </div>
    );
  }

  const handlePlaceBet = async (optionId: string, amount: number) => {
    const optionLabel = market?.options.find(o => o.id === optionId)?.label ?? "보트";
    const description = `보트: ${market?.question?.slice(0, 20) ?? ""}… [${optionLabel}]`;

    // 서버에서 한도 검증 + bet_history 기록 (RLS 우회)
    try {
      const res = await fetch("/api/place-bet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ marketId, optionId, amount }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        window.alert(json?.message ?? "베팅 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.");
        return;
      }
    } catch {
      window.alert("네트워크 오류로 베팅을 처리할 수 없습니다. 잠시 후 다시 시도해주세요.");
      return;
    }

    const spent = spendUserPoints(userId, amount, description);
    if (!spent.ok) {
      window.alert("보유 페블이 부족합니다.");
      return;
    }
    const next = addMarketBet(marketId, optionId, amount, authorDisplayName || "익명", userId);
    if (next) setBets((prev) => [...prev, next]);
  };

  // ─── 정산 핸들러 ───────────────────────────────────────────────────────────
  const handleSettle = (winningOptionId: string) => {
    if (!market || settling) return;
    setSettling(true);

    // 실제 베팅만으로 풀 계산 (mock seed 제외)
    const realPool = bets.reduce((acc, b) => acc + b.amount, 0);
    const { adminFee, creatorFee, dividendPool } = calculateFees(realPool);

    // 창작자 수수료 지급 (현재 유저 = 창작자인 경우)
    const isCreator = market.authorId && market.authorId === userId;
    if (isCreator && creatorFee > 0) {
      earnUserPoints(userId, creatorFee, `🏆 보트 창작자 수수료 — ${market.question.slice(0, 20)}…`);
    }

    // UserMarket 업데이트 (localStorage)
    const um = getUserMarketById(marketId);
    if (um) {
      updateUserMarket({
        ...um,
        winningOptionId,
        settledAt: new Date().toISOString(),
        adminFeeCollected: adminFee,
        creatorFeeCollected: creatorFee,
      });
    }

    setSettleMode(false);
    setSettling(false);
  };

  const [commentText, setCommentText] = useState("");
  const [comments, setComments] = useState<MarketComment[]>([]);
  const [bets, setBets] = useState<MarketBet[]>([]);

  // ─── 배당금 / 정산 계산 (bets 선언 이후) ─────────────────────────────────
  const winningOptionId = market?.winningOptionId;
  const isSettled = !!winningOptionId;
  const realPool = bets.reduce((acc, b) => acc + b.amount, 0);

  const myWinningBets = winningOptionId
    ? getUserBetsOnOption(marketId, winningOptionId, userId)
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
    earnUserPoints(userId, myPayout, `🎉 보트 배당금 수령 — ${market?.question?.slice(0, 20) ?? ""}…`);
    markWinningsClaimed(userId, marketId);
  };

  // 결과 발표 시간이 지났는지 여부
  const resultAtPassed = market?.resultAt ? new Date() >= market.resultAt : true;

  // 정산 권한: 운영자(시간 무관) 또는 창작자(결과 발표 시간 이후)
  const canSettle = !isSettled && (
    isAdmin ||
    (market?.authorId === userId && userId !== "anon" && resultAtPassed)
  );

  // 좋아요로 이미 받은 수익 (localStorage 기반)
  const likesEarned = useMemo(() => {
    if (typeof window === "undefined") return 0;
    try {
      const raw = window.localStorage.getItem("voters.likes.rewards.v1");
      if (!raw) return 0;
      const all = JSON.parse(raw) as Record<string, number>;
      return (all[`market:${marketId}`] ?? 0) * 100;
    } catch { return 0; }
  }, [marketId]);

  useEffect(() => {
    setComments(getCommentsForMarket(marketId));
    setBets(getBetsForMarket(marketId));
  }, [marketId]);

  useEffect(() => {
    const onUpdated = () => {
      setComments(getCommentsForMarket(marketId));
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

  const optionLabelById = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of market.options) map.set(o.id, o.label);
    return map;
  }, [market.options]);

  const derivedMarket = useMemo(() => {
    // Seed pool based on initial mock distribution so we don't start from 0.
    const seededByOptionId = new Map<string, number>();
    for (const o of market.options) {
      seededByOptionId.set(o.id, Math.round((market.totalPool * o.percentage) / 100));
    }

    const betByOptionId = new Map<string, number>();
    for (const b of bets) {
      betByOptionId.set(b.optionId, (betByOptionId.get(b.optionId) ?? 0) + b.amount);
    }

    const optionPoints = market.options.map((o) => {
      const seeded = seededByOptionId.get(o.id) ?? 0;
      const added = betByOptionId.get(o.id) ?? 0;
      return { ...o, points: Math.max(0, seeded + added) };
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
  }, [bets, market.options, market.totalPool]);

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
    const per = betsByAuthor.get(userId) ?? new Map<string, number>();
    const entries = Array.from(per.entries())
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1]);
    const total = entries.reduce((acc, [, v]) => acc + v, 0);
    return { entries, total };
  }, [betsByAuthor, userId]);

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
            {/* Back Button */}
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors mb-6"
            >
              <ArrowLeft className="size-4" />
              <span className="text-sm">보트 목록으로</span>
            </button>

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
                <h1 className="text-xl md:text-2xl lg:text-3xl font-bold text-foreground leading-tight text-balance">
                  {market.question}
                </h1>
                <button
                  type="button"
                  className={cn(
                    "shrink-0 inline-flex items-center gap-1.5 rounded-lg px-3 py-2 border transition-colors",
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
                      checkAndGrantLikeReward(
                        market.authorId,
                        `market:${marketId}`,
                        next.count,
                      );
                    }
                  }}
                  aria-label="좋아요"
                >
                  <Heart className={cn("size-4", liked ? "fill-current" : "")} />
                  <span className="text-sm font-semibold">{likeCount}</span>
                </button>
              </div>

              {/* 마감까지 남은 시간 (초 단위 실시간 카운트다운) */}
              <CountdownTimer
                closingAt={market.endsAt}
                confirmedAt={market.resultAt ?? market.endsAt}
                className="mb-3"
              />

              <p className="text-sm text-muted-foreground mb-4">
                {market.description}
              </p>

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
                <div className="flex items-center gap-1.5">
                  <ExternalLink className="size-3.5" />
                  <span>정산: {market.resolver}</span>
                </div>
              </div>
            </div>

                {/* ─── 정산 완료 배너 ─────────────────────────────────────── */}
                {isSettled && (() => {
                  const winOption = market.options.find(o => o.id === winningOptionId);
                  const { adminFee, creatorFee, dividendPool } = calculateFees(realPool);
                  return (
                    <div
                      className="rounded-xl border p-4 space-y-3"
                      style={{
                        borderColor: winOption ? `color-mix(in oklch, ${winOption.color} 40%, transparent)` : undefined,
                        background: winOption
                          ? `linear-gradient(135deg, color-mix(in oklch, ${winOption.color} 10%, transparent), transparent)`
                          : undefined,
                      }}
                    >
                      <div className="flex items-center gap-2">
                        <Trophy className="size-5 text-yellow-400" />
                        <span className="font-bold text-foreground">보트 정산 완료</span>
                        {winOption && (
                          <span className="text-sm font-semibold px-2 py-0.5 rounded-full" style={{ background: `color-mix(in oklch, ${winOption.color} 20%, transparent)`, color: winOption.color }}>
                            {winOption.label} 당첨
                          </span>
                        )}
                      </div>

                      {/* 수수료 분배 내역 */}
                      {realPool > 0 && (
                        <div className="grid grid-cols-3 gap-2 text-center text-xs">
                          <div className="rounded-lg bg-secondary/40 px-2 py-2">
                            <p className="text-muted-foreground">운영자 수수료</p>
                            <p className="font-bold text-foreground mt-0.5">{adminFee.toLocaleString()} P</p>
                          </div>
                          <div className="rounded-lg bg-secondary/40 px-2 py-2">
                            <p className="text-muted-foreground">창작자 수수료</p>
                            <p className="font-bold text-foreground mt-0.5">{creatorFee.toLocaleString()} P</p>
                          </div>
                          <div className="rounded-lg bg-secondary/40 px-2 py-2">
                            <p className="text-muted-foreground">배당 풀</p>
                            <p className="font-bold text-foreground mt-0.5">{dividendPool.toLocaleString()} P</p>
                          </div>
                        </div>
                      )}

                      {/* 배당금 수령 버튼 */}
                      {canClaim && (
                        <button
                          onClick={handleClaim}
                          className="w-full py-2.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all"
                          style={{
                            background: winOption?.color ?? "var(--chart-5)",
                            color: "white",
                            boxShadow: winOption ? `0 4px 16px color-mix(in oklch, ${winOption.color} 30%, transparent)` : undefined,
                          }}
                        >
                          <Award className="size-4" />
                          배당금 수령 — {myPayout.toLocaleString()} P
                        </button>
                      )}
                      {isSettled && myWinningBets > 0 && alreadyClaimed && (
                        <div className="text-center text-sm text-muted-foreground flex items-center justify-center gap-1.5">
                          <Award className="size-4 text-green-500" />
                          배당금 수령 완료
                        </div>
                      )}
                      {isSettled && myWinningBets === 0 && userId !== "anon" && (
                        <div className="text-center text-sm text-muted-foreground">
                          이번 보트에서 당첨 선택지에 베팅하지 않았습니다.
                        </div>
                      )}
                    </div>
                  );
                })()}

                {/* ─── 정산 패널 (운영자 / 창작자) ─────────────────────────── */}
                {/* 창작자에게 결과 발표 시간 전 안내 */}
                {!isSettled && !canSettle && market?.authorId === userId && userId !== "anon" && !resultAtPassed && market?.resultAt && (
                  <div className="rounded-xl border border-border/40 bg-secondary/10 p-4 flex items-start gap-3">
                    <Clock className="size-4 text-muted-foreground shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-foreground">결과 입력 대기 중</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        결과 발표 시간({market.resultAt.toLocaleString("ko-KR", { timeZone: "Asia/Seoul", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })} KST) 이후에 결과를 입력할 수 있습니다.
                      </p>
                    </div>
                  </div>
                )}

                {canSettle && (
                  <div className="rounded-xl border border-chart-5/30 bg-card p-4 space-y-3"
                    style={{ boxShadow: "0 0 20px color-mix(in oklch, var(--chart-5) 8%, transparent)" }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <Trophy className="size-4 text-chart-5" />
                        <span className="font-semibold text-foreground text-sm">결과 입력</span>
                        <span className="text-xs text-muted-foreground">{isAdmin && market?.authorId !== userId ? "(운영자)" : "(창작자)"}</span>
                      </div>
                      <button
                        onClick={() => setSettleMode(v => !v)}
                        className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {settleMode ? "닫기" : "펼치기"}
                      </button>
                    </div>

                    {settleMode && (
                      <div className="space-y-3">
                        {/* 수수료 미리보기 */}
                        {realPool > 0 && (() => {
                          const { adminFee, creatorFee, dividendPool } = calculateFees(realPool);
                          const isCreator = market.authorId === userId;
                          return (
                            <div className="rounded-lg bg-secondary/20 px-3 py-3 space-y-2">
                              <p className="text-xs text-muted-foreground font-medium">베팅 풀: {realPool.toLocaleString()} P</p>
                              <div className="grid grid-cols-3 gap-1.5 text-center text-xs">
                                <div className="rounded-lg bg-secondary/40 py-1.5">
                                  <p className="text-muted-foreground">운영자</p>
                                  <p className="font-bold">{adminFee.toLocaleString()} P</p>
                                </div>
                                <div className={cn("rounded-lg py-1.5", isCreator ? "bg-chart-5/10" : "bg-secondary/40")}>
                                  <p className="text-muted-foreground">창작자</p>
                                  <p className={cn("font-bold", isCreator ? "text-chart-5" : "")}>{creatorFee.toLocaleString()} P</p>
                                </div>
                                <div className="rounded-lg bg-secondary/40 py-1.5">
                                  <p className="text-muted-foreground">배당 풀</p>
                                  <p className="font-bold">{dividendPool.toLocaleString()} P</p>
                                </div>
                              </div>
                              {isCreator && (
                                <p className="text-[11px] text-chart-5 text-center">
                                  ✓ 결과 확정 시 창작자 수수료 {creatorFee.toLocaleString()} P가 즉시 지급됩니다
                                </p>
                              )}
                            </div>
                          );
                        })()}

                        <p className="text-xs text-muted-foreground">당첨 선택지를 선택하세요:</p>
                        <div className={cn("grid gap-2", market.options.length === 2 ? "grid-cols-2" : "grid-cols-1")}>
                          {market.options.map(opt => (
                            <button
                              key={opt.id}
                              onClick={() => setPendingSettleOption(opt)}
                              disabled={settling}
                              className="py-3 px-3 rounded-xl text-sm font-semibold border-2 transition-all hover:scale-[1.02]"
                              style={{
                                borderColor: `color-mix(in oklch, ${opt.color} 40%, transparent)`,
                                background: `color-mix(in oklch, ${opt.color} 10%, transparent)`,
                                color: opt.color,
                              }}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ─── 결과 확정 확인 다이얼로그 ───────────────────────────── */}
                {pendingSettleOption && (() => {
                  const opt = pendingSettleOption;
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
                        className="relative w-full max-w-sm rounded-2xl border shadow-2xl overflow-hidden"
                        style={{
                          borderColor: `color-mix(in oklch, ${opt.color} 40%, transparent)`,
                          boxShadow: `0 0 40px color-mix(in oklch, ${opt.color} 20%, transparent)`,
                        }}
                        onClick={e => e.stopPropagation()}
                      >
                        {/* 상단 색상 띠 */}
                        <div className="h-1.5 w-full" style={{ background: opt.color }} />

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

                          {/* 선택한 당첨 항목 */}
                          <div className="rounded-xl border px-4 py-3 space-y-1"
                            style={{
                              borderColor: `color-mix(in oklch, ${opt.color} 35%, transparent)`,
                              background: `color-mix(in oklch, ${opt.color} 8%, transparent)`,
                            }}
                          >
                            <p className="text-[11px] text-muted-foreground">당첨 선택지</p>
                            <p className="text-xl font-bold" style={{ color: opt.color }}>{opt.label}</p>
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
                                  <span className="text-muted-foreground">🏆 창작자 수수료 (5%)</span>
                                  <span className="font-semibold text-chart-5">{creatorFee.toLocaleString()} P</span>
                                </div>
                                <div className="flex items-center justify-between pt-1.5 border-t border-border/30">
                                  <span className="font-semibold text-foreground">합계</span>
                                  <span className="font-bold text-chart-5 text-sm">{totalEarnings.toLocaleString()} P</span>
                                </div>
                              </div>
                              {creatorFee > 0 && (
                                <p className="text-[11px] text-muted-foreground">
                                  * 창작자 수수료 {creatorFee.toLocaleString()} P는 확정 즉시 지급됩니다
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
                              onClick={() => { handleSettle(opt.id); setPendingSettleOption(null); }}
                              disabled={settling}
                              className="flex-1 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-1.5 transition-all disabled:opacity-50"
                              style={{
                                background: opt.color,
                                color: "white",
                                boxShadow: `0 4px 16px color-mix(in oklch, ${opt.color} 35%, transparent)`,
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
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-foreground">
                        댓글 <span className="text-muted-foreground">({comments.length})</span>
                      </div>
                      <div className="text-xs text-muted-foreground" suppressHydrationWarning>
                        {userId === "anon" ? "로그인하면 닉네임으로 표시돼요" : `작성자: ${userId}`}
                      </div>
                    </div>

                    <div className="mt-4 flex-1 overflow-auto pr-1 space-y-2">
                      {comments.length === 0 ? (
                        <div className="text-sm text-muted-foreground py-10 text-center">
                          아직 댓글이 없습니다.
                        </div>
                      ) : (
                        comments.map((c) => {
                          const per = betsByAuthor.get(c.author);
                          const sorted = per
                            ? Array.from(per.entries())
                                .filter(([, v]) => v > 0)
                                .sort((a, b) => b[1] - a[1])
                            : [];
                          const lines = sorted.slice(0, 3);
                          const betSummary =
                            lines.length === 0
                              ? null
                              : lines
                                  .map(([optId, amt]) => `${optionLabelByIdDerived.get(optId) ?? optId} ${amt.toLocaleString()}P`)
                                  .join(" · ");
                          const topOptionId = sorted[0]?.[0];
                          const topOptionColor = derivedMarket.options.find((o) => o.id === topOptionId)?.color;
                          return (
                            <div
                              key={c.id}
                              className="rounded-lg border border-border/50 px-4 py-3"
                              style={{
                                backgroundColor: topOptionColor
                                  ? `color-mix(in oklch, ${topOptionColor} 14%, transparent)`
                                  : "color-mix(in oklch, oklch(0.25 0.01 260) 12%, transparent)",
                              }}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-foreground truncate">{c.author}</div>
                                  {betSummary && (
                                    <div className="mt-0.5 text-[11px] text-muted-foreground truncate">
                                      {betSummary}
                                    </div>
                                  )}
                                </div>
                                <div className="text-[11px] text-muted-foreground shrink-0">
                                  {new Date(c.createdAt).toLocaleString("ko-KR")}
                                </div>
                              </div>
                              <div className="mt-2 text-sm whitespace-pre-wrap text-foreground">{c.content}</div>
                            </div>
                          );
                        })
                      )}
                    </div>

                    <div className="mt-4 flex items-center gap-2">
                      <Input
                        value={commentText}
                        onChange={(e) => setCommentText(e.target.value)}
                        placeholder="댓글을 입력하세요"
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        onClick={() => {
                          const next = addMarketComment(marketId, commentText);
                          if (!next) return;
                          setCommentText("");
                          setComments(getCommentsForMarket(marketId));
                        }}
                        className="bg-chart-5 text-primary-foreground hover:bg-chart-5/90"
                      >
                        등록
                      </Button>
                    </div>
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
                  ) : (
                    <BetPanel
                      options={derivedMarket.options}
                      userBalance={userBalance}
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
                  ) : (
                    <BetPanel
                      options={derivedMarket.options}
                      userBalance={userBalance}
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
