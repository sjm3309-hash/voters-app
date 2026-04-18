-- 유저 생성 보트에서 영어 내부 ID / 구 영문 표기로 저장된 sub_category를 한국어/표준 라벨로 변환
-- 스포츠
UPDATE public.bets SET sub_category = '해외축구' WHERE sub_category = 'football';
UPDATE public.bets SET sub_category = '국내야구' WHERE sub_category = 'baseball_kr';
UPDATE public.bets SET sub_category = '농구'     WHERE sub_category = 'basketball';

-- 게임: 내부 ID (소문자) → 표준 라벨
UPDATE public.bets SET sub_category = 'LoL'       WHERE sub_category = 'lol';
UPDATE public.bets SET sub_category = '발로란트'  WHERE sub_category = 'valorant';
UPDATE public.bets SET sub_category = '스타크래프트' WHERE sub_category = 'starcraft';

-- 게임: 구 영문 표기 → 한국어 (VALORANT → 발로란트, StarCraft → 스타크래프트)
UPDATE public.bets SET sub_category = '발로란트'    WHERE sub_category = 'VALORANT';
UPDATE public.bets SET sub_category = '스타크래프트' WHERE sub_category = 'StarCraft';
UPDATE public.bets SET sub_category = '스타크래프트' WHERE sub_category = 'StarCraft 2';
UPDATE public.bets SET sub_category = '스타크래프트' WHERE sub_category = 'SC2';

-- 주식 (category='주식'과 함께 저장된 경우)
UPDATE public.bets SET sub_category = '국내주식' WHERE sub_category = 'domestic' AND category = '주식';
UPDATE public.bets SET sub_category = '해외주식' WHERE sub_category = 'overseas' AND category = '주식';

-- 정치 (category='정치'와 함께 저장된 경우)
UPDATE public.bets SET sub_category = '국내정치' WHERE sub_category = 'domestic' AND category = '정치';
UPDATE public.bets SET sub_category = '해외정치' WHERE sub_category = 'overseas' AND category = '정치';

-- 나머지 미처리 항목 → 기타
UPDATE public.bets SET sub_category = '기타' WHERE sub_category IN ('domestic', 'overseas', 'other');
