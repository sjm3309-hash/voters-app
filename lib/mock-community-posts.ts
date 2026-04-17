export type MockCommunityPost = {
  id: string;
  title: string;
  content: string;
  category: "sports" | "fun" | "stocks" | "crypto" | "politics" | "game";
  thumbnail?: string;
  commentCount: number;
  author: string;
  timestamp: Date;
  isHot?: boolean;
};

export const mockCommunityPosts: MockCommunityPost[] = [
  {
    id: "1",
    title: "ETF 승인 이후 기관 자금 유입 분석",
    content:
      "ETF 승인 이후 기관 자금이 어떤 경로로 유입되는지 정리해봤어요. 온체인/거래소 데이터 기준으로 보면 단기적으로는 변동성이 커질 수 있습니다.",
    category: "crypto",
    thumbnail: "https://picsum.photos/seed/btc1/100/100",
    commentCount: 47,
    author: "크립토고래",
    timestamp: new Date(Date.now() - 1000 * 60 * 5),
    isHot: true,
  },
  {
    id: "2",
    title: "연준 금리 인하 시나리오별 가격 예측",
    content:
      "금리 인하 폭에 따른 자산군별 반응을 시나리오로 나눠봤습니다. (25bp/50bp/동결) 여러분 의견도 궁금합니다.",
    category: "stocks",
    thumbnail: "https://picsum.photos/seed/fed/100/100",
    commentCount: 32,
    author: "매크로분석가",
    timestamp: new Date(Date.now() - 1000 * 60 * 12),
    isHot: true,
  },
  {
    id: "3",
    title: "기술적 분석: 현재 지지선과 저항선 정리",
    content:
      "단기/중기 관점에서 주요 지지선과 저항선을 정리했습니다. 손절/익절 라인 잡을 때 참고용으로 봐주세요.",
    category: "crypto",
    thumbnail: "https://picsum.photos/seed/chart/100/100",
    commentCount: 28,
    author: "차트장인",
    timestamp: new Date(Date.now() - 1000 * 60 * 25),
  },
  {
    id: "4",
    title: "반감기 효과, 이번에도 적용될까?",
    content:
      "과거 사이클을 보면 반감기 이후 상승이 있었지만, 이번에는 거시 변수도 많아서 동일하게 적용될지 모르겠네요.",
    category: "crypto",
    thumbnail: "https://picsum.photos/seed/halving/100/100",
    commentCount: 21,
    author: "장기홀더",
    timestamp: new Date(Date.now() - 1000 * 60 * 45),
  },
  {
    id: "5",
    title: "초보자 질문) 베팅 타이밍 조언 부탁드려요",
    content:
      "처음 베팅해보는데, 진입 타이밍을 어떻게 잡는 게 좋을까요? 인기/최신 중 어떤 기준이 더 유리한지도 궁금합니다.",
    category: "fun",
    commentCount: 15,
    author: "뉴비투자자",
    timestamp: new Date(Date.now() - 1000 * 60 * 60),
  },
  {
    id: "5b",
    title: "오늘의 밈: 이게 진짜 확률이냐?",
    content:
      "예측 시장에서 가끔 말도 안 되게 흔들리는 구간이 있죠. 오늘 본 밈 중에 제일 웃긴 거 공유합니다.",
    category: "fun",
    commentCount: 9,
    author: "밈수집가",
    timestamp: new Date(Date.now() - 1000 * 60 * 70),
    isHot: true,
  },
  {
    id: "5c",
    title: "게임 확률 시장 너무 웃김",
    content:
      "패치 한 번에 확률이 출렁이는 거 보고 웃다가도, 정보가 곧 돈이라는 걸 다시 느꼈습니다.",
    category: "game",
    commentCount: 6,
    author: "겜잘알",
    timestamp: new Date(Date.now() - 1000 * 60 * 80),
  },
  {
    id: "6",
    title: "오늘 뉴스 정리: 주요 이슈 요약",
    content:
      "오늘 시장에 영향을 준 주요 이슈들을 짧게 요약합니다. (매크로/정책/기업) 추가할 뉴스 있으면 댓글로 알려주세요.",
    category: "stocks",
    thumbnail: "https://picsum.photos/seed/news/100/100",
    commentCount: 12,
    author: "뉴스봇",
    timestamp: new Date(Date.now() - 1000 * 60 * 90),
  },
  {
    id: "7",
    title: "손절 vs 존버, 여러분의 선택은?",
    content:
      "이번 변동장에서 손절을 할지, 존버를 할지 갈리네요. 여러분은 어떤 전략을 쓰고 있나요?",
    category: "fun",
    commentCount: 56,
    author: "고민러",
    timestamp: new Date(Date.now() - 1000 * 60 * 120),
    isHot: true,
  },
  {
    id: "8",
    title: "이번 달 베팅 수익 인증합니다",
    content:
      "이번 달 수익 인증 겸 매매일지를 공유해요. 운도 많이 따랐습니다. 다들 성투하세요.",
    category: "stocks",
    thumbnail: "https://picsum.photos/seed/profit/100/100",
    commentCount: 89,
    author: "수익왕",
    timestamp: new Date(Date.now() - 1000 * 60 * 180),
    isHot: true,
  },
];
