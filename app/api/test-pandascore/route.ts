import { NextResponse } from "next/server";

export async function GET() {
  try {
    /**
     * (임시 모크 분기)
     * - 로컬 모크 테스트를 위해 사용하던 분기입니다.
     * - 실제 데이터 재활성화 요청에 따라 현재는 비활성(주석) 상태로 보관합니다.
     *
     * if (useMockPredictionData()) {
     *   const sample = getMockPandascoreTestSample();
     *   return NextResponse.json({ ok: true, count: sample.length, sample, _mock: true });
     * }
     */

    const apiKey = process.env.PANDASCORE_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { ok: false, error: "Missing PANDASCORE_API_KEY" },
        { status: 500 },
      );
    }

    let res: Response;
    try {
      res = await fetch("https://api.pandascore.co/lol/matches/upcoming", {
        headers: { Authorization: `Bearer ${apiKey}` },
        next: { revalidate: 3600 },
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log("[test-pandascore] fetch error", msg);
      return NextResponse.json({ ok: false, error: msg }, { status: 502 });
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { ok: false, error: `PandaScore ${res.status}`, body: text },
        { status: 502 },
      );
    }

    const data = (await res.json()) as any[];
    const sample = (Array.isArray(data) ? data : []).slice(0, 5).map((m) => ({
      id: m?.id,
      name: m?.name ?? null,
      begin_at: m?.begin_at ?? m?.scheduled_at ?? null,
    }));

    console.log("[test-pandascore]", {
      count: Array.isArray(data) ? data.length : 0,
      sampleIds: sample.map((s) => s.id).filter(Boolean),
    });
    return NextResponse.json({ ok: true, count: Array.isArray(data) ? data.length : 0, sample });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}

