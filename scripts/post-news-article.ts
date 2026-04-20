/**
 * 새 뉴스 게시글 작성 (이미지 업로드 + DB 삽입)
 *   npx tsx scripts/post-news-article.ts
 */
import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";

dotenv.config({ path: ".env.local" });

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v?.trim()) throw new Error(`Missing env: ${name}`);
  return v.trim();
}

const AUTHOR_USER_ID = "ff839ce8-4dbe-4a6d-8837-a851c76574b8";
const BUCKET = "board-images";

// 이미지 파일 경로
// a1 = OSEN 헤더 + 김민석 사진 (사진 있는 파일)
// a2 = 기사 본문 텍스트
const IMG_PHOTO = String.raw`C:\Users\sjm33\.cursor\projects\c-Users-sjm33-voters-app\assets\c__Users_sjm33_AppData_Roaming_Cursor_User_workspaceStorage_01a8addba369c529bbae1b3c1259f320_images_a1-f2ba67d0-e769-45d5-9535-58d50ffdf962.png`;
const IMG_TEXT  = String.raw`C:\Users\sjm33\.cursor\projects\c-Users-sjm33-voters-app\assets\c__Users_sjm33_AppData_Roaming_Cursor_User_workspaceStorage_01a8addba369c529bbae1b3c1259f320_images_a2-e47fd5b4-fa4e-4de0-bf02-d70ef0e1d847.png`;

const TITLE    = "'대박' 롯데-두산 초대형 트레이드 전격 단행…두산에 투혼의 복덩이 왔다";
const NEWS_URL = "https://m.sports.naver.com/baseball/article/109/0005210000";

async function uploadImage(
  svc: ReturnType<typeof createClient>,
  localPath: string,
  storagePath: string,
): Promise<string> {
  const buf = fs.readFileSync(localPath);
  const { error } = await svc.storage
    .from(BUCKET)
    .upload(storagePath, buf, { contentType: "image/png", upsert: true });
  if (error) throw new Error(`Upload failed [${storagePath}]: ${error.message}`);
  return svc.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
}

async function main() {
  const svc = createClient(mustEnv("NEXT_PUBLIC_SUPABASE_URL"), mustEnv("SUPABASE_SERVICE_ROLE_KEY"));

  // 작성자 닉네임 조회
  const { data: profile } = await svc
    .from("profiles")
    .select("nickname")
    .eq("id", AUTHOR_USER_ID)
    .maybeSingle();
  const authorName = (profile as { nickname?: string } | null)?.nickname ?? "관리자";
  console.log(`작성자: ${authorName}`);

  // 이미지 업로드 (고유 폴더명으로)
  const folder = `news/${Date.now()}`;
  console.log("이미지 업로드 중...");
  const urlPhoto = await uploadImage(svc, IMG_PHOTO, `${folder}/photo.png`);
  const urlText  = await uploadImage(svc, IMG_TEXT,  `${folder}/text.png`);
  console.log("  사진:", urlPhoto);
  console.log("  본문:", urlText);

  const content = `📰 OSEN | 이후광 기자\n${NEWS_URL}`;

  const contentHtml = `
<p style="color:#888;font-size:0.8em;margin:0 0 14px;">
  📰 <strong>OSEN</strong> &nbsp;|&nbsp; 이후광 기자 &nbsp;|&nbsp; 2026.04.20
</p>
<img src="${urlPhoto}" alt="기사 사진" style="width:100%;max-width:600px;border-radius:10px;display:block;margin-bottom:10px;" />
<img src="${urlText}"  alt="기사 본문" style="width:100%;max-width:600px;border-radius:10px;display:block;margin-bottom:16px;" />
<a href="${NEWS_URL}" target="_blank" rel="noopener noreferrer"
   style="display:inline-block;padding:10px 20px;background:#1e293b;color:#fff;border-radius:8px;text-decoration:none;font-size:0.88em;font-weight:600;">
  🔗 원문 기사 보러가기
</a>`.trim();

  const { data: inserted, error } = await svc
    .from("board_posts")
    .insert({
      title: TITLE,
      content,
      content_html: contentHtml,
      category: "sports",
      sub_category: "국내야구",
      author_id: AUTHOR_USER_ID,
      author_name: authorName,
      thumbnail_url: urlPhoto,
      images: [],
      views: 0,
      comment_count: 0,
      is_hot: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) { console.error("❌ 등록 실패:", error.message); process.exit(1); }

  console.log(`\n✅ 게시글 등록 완료!`);
  console.log(`   ID: ${inserted.id}`);
  console.log(`   제목: ${TITLE}`);
  console.log(`   카테고리: sports / 해외축구`);
  console.log(`   이미지 순서: 사진(헤더) → 본문 텍스트`);
}

main().catch((e) => { console.error(e); process.exit(1); });
