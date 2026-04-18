-- place_bets_secure 함수 수정
-- bet_history 컬럼명이 boat_id가 아닌 bet_id 이므로 수정

-- 기존 함수 삭제 (모든 오버로드)
DROP FUNCTION IF EXISTS public.place_bets_secure(uuid, uuid, jsonb);
DROP FUNCTION IF EXISTS public.place_bets_secure(uuid, text, jsonb);

CREATE OR REPLACE FUNCTION public.place_bets_secure(
  p_user_id  uuid,
  p_boat_id  uuid,
  p_bets     jsonb          -- [{option_id: text, amount: bigint}, ...]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_amount    bigint := 0;
  v_user_pebbles    bigint;
  v_bet_status      text;
  v_bet_closing_at  timestamptz;
  v_existing_stake  bigint := 0;
  v_leg             jsonb;
  v_option_id       text;
  v_leg_amount      bigint;
  v_remaining       bigint;
  v_option_totals   jsonb;
  v_my_totals       jsonb;
  MAX_STAKE constant bigint := 5000;
BEGIN
  -- 1. 보트 상태 확인
  SELECT status, closing_at
  INTO   v_bet_status, v_bet_closing_at
  FROM   public.bets
  WHERE  id = p_boat_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'invalid_market: 보트를 찾을 수 없습니다.';
  END IF;

  IF v_bet_status <> 'active' THEN
    RAISE EXCEPTION 'finalized: 이미 종료된 보트입니다.';
  END IF;

  IF v_bet_closing_at <= now() THEN
    RAISE EXCEPTION 'closed: 마감된 보트입니다.';
  END IF;

  -- 2. 요청된 총 베팅 금액 합산
  FOR v_leg IN SELECT value FROM jsonb_array_elements(p_bets)
  LOOP
    v_leg_amount := (v_leg ->> 'amount')::bigint;
    IF v_leg_amount IS NULL OR v_leg_amount <= 0 THEN
      RAISE EXCEPTION 'invalid_amount: 유효하지 않은 베팅 금액입니다.';
    END IF;
    v_total_amount := v_total_amount + v_leg_amount;
  END LOOP;

  IF v_total_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_bets: 베팅 내역이 없습니다.';
  END IF;

  -- 3. 유저 잔액 확인 (락 획득)
  SELECT pebbles
  INTO   v_user_pebbles
  FROM   public.profiles
  WHERE  id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'profile_missing: 프로필이 없습니다.';
  END IF;

  IF v_user_pebbles < v_total_amount THEN
    RAISE EXCEPTION 'insufficient_pebbles: 페블이 부족합니다. (보유: % / 필요: %)', v_user_pebbles, v_total_amount;
  END IF;

  -- 4. 보트 한도 확인 (이 보트에 이미 베팅한 누적액 + 이번 금액 <= MAX_STAKE)
  SELECT COALESCE(SUM(amount), 0)
  INTO   v_existing_stake
  FROM   public.bet_history
  WHERE  user_id = p_user_id
    AND  bet_id  = p_boat_id;

  IF v_existing_stake + v_total_amount > MAX_STAKE THEN
    RAISE EXCEPTION 'limit_exceeded: 보트당 최대 베팅 한도(% P)를 초과합니다. (현재 누적: % P)', MAX_STAKE, v_existing_stake;
  END IF;

  -- 5. 페블 차감
  UPDATE public.profiles
  SET    pebbles = pebbles - v_total_amount
  WHERE  id = p_user_id
  RETURNING pebbles INTO v_remaining;

  -- 6. bet_history 에 각 선택지별 기록 (bet_id 컬럼 사용)
  FOR v_leg IN SELECT value FROM jsonb_array_elements(p_bets)
  LOOP
    v_option_id  := v_leg ->> 'option_id';
    v_leg_amount := (v_leg ->> 'amount')::bigint;

    INSERT INTO public.bet_history (user_id, bet_id, amount, choice)
    VALUES (p_user_id, p_boat_id, v_leg_amount, v_option_id);
  END LOOP;

  -- 7. 반환값: 남은 잔액 + 전체/내 선택지 합산
  SELECT COALESCE(jsonb_object_agg(choice, tot), '{}'::jsonb)
  INTO   v_option_totals
  FROM   (
    SELECT choice, SUM(amount) AS tot
    FROM   public.bet_history
    WHERE  bet_id = p_boat_id
    GROUP  BY choice
  ) s;

  SELECT COALESCE(jsonb_object_agg(choice, tot), '{}'::jsonb)
  INTO   v_my_totals
  FROM   (
    SELECT choice, SUM(amount) AS tot
    FROM   public.bet_history
    WHERE  bet_id  = p_boat_id
      AND  user_id = p_user_id
    GROUP  BY choice
  ) s;

  RETURN jsonb_build_object(
    'remaining_balance', v_remaining,
    'option_totals',     v_option_totals,
    'my_option_totals',  v_my_totals
  );
END;
$$;

REVOKE ALL ON FUNCTION public.place_bets_secure(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.place_bets_secure(uuid, uuid, jsonb) TO service_role;
