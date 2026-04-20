/**
 * 이미지 순서 1→2 로 게시글 업데이트
 *   npx tsx scripts/upload-news-images.ts
 */
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v?.trim()) throw new Error(`Missing env: ${name}`);
  return v.trim();
}

const POST_ID  = "8703fa8a-18ab-4d39-bbc8-c3c91845cbdb";
const NEWS_URL = "https://m.sports.naver.com/wfootball/article/477/0000604269";
const BASE     = "https://beqjtibkgtmdqahkmmcb.supabase.co/storage/v1/object/public/board-images";

// 이미 업로드된 이미지 URL
// images_1 (본문 텍스트) = body.png
// images_2 (헤더+사진)  = header.png
const url1 = `${BASE}/news/${POST_ID}/body.png`;   // 사진 1번 (본문)
const url2 = `${BASE}/news/${POST_ID}/header.png`; // 사진 2번 (헤더+손흥민)

async function main() {
  const svc = createClient(mustEnv("NEXT_PUBLIC_SUPABASE_URL"), mustEnv("SUPABASE_SERVICE_ROLE_KEY"));

  const content = "📰 스포티비뉴스 | 박대현 기자\n" + NEWS_URL;

  const contentHtml = `
<p style="color:#888;font-size:0.8em;margin:0 0 14px;">
  📰 <strong>스포티비뉴스</strong> &nbsp;|&nbsp; 박대현 기자 &nbsp;|&nbsp; 2026.04.19
</p>
<img src="${url1}" alt="뉴스 본문" style="width:100%;max-width:600px;border-radius:10px;display:block;margin-bottom:10px;" />
<img src="${url2}" alt="뉴스 헤더" style="width:100%;max-width:600px;border-radius:10px;display:block;margin-bottom:16px;" />
<a href="${NEWS_URL}" target="_blank" rel="noopener noreferrer"
   style="display:inline-block;padding:10px 20px;background:#1e293b;color:#fff;border-radius:8px;text-decoration:none;font-size:0.88em;font-weight:600;">
  🔗 원문 기사 보러가기
</a>`.trim();

  const { error } = await svc
    .from("board_posts")
    .update({ content, content_html: contentHtml, thumbnail_url: url1, updated_at: new Date().toISOString() })
    .eq("id", POST_ID);

  if (error) { console.error("❌ 실패:", error.message); process.exit(1); }
  console.log("✅ 순서 변경 완료! (1번 본문 → 2번 헤더+사진)");
}

main().catch((e) => { console.error(e); process.exit(1); });
