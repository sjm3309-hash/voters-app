/**
 * 원태인 태도 논란 기사 — 국내야구 카테고리 게시
 *   npx tsx scripts/post-wontaein-news.ts
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

const AUTHOR_USER_ID = "ff839ce8-4dbe-4a6d-8837-a851c76574b8"; // 만두왕
const BUCKET = "board-images";

// 파일 번호 순서: b1 → b2 → b3
const IMG_B1 = String.raw`C:\Users\sjm33\.cursor\projects\c-Users-sjm33-voters-app\assets\c__Users_sjm33_AppData_Roaming_Cursor_User_workspaceStorage_01a8addba369c529bbae1b3c1259f320_images_b1-dd358a55-5600-4083-b685-062e1234258d.png`;
const IMG_B2 = String.raw`C:\Users\sjm33\.cursor\projects\c-Users-sjm33-voters-app\assets\c__Users_sjm33_AppData_Roaming_Cursor_User_workspaceStorage_01a8addba369c529bbae1b3c1259f320_images_b2-8c53edf0-c21c-478d-a462-7b3e94a4f044.png`;
const IMG_B3 = String.raw`C:\Users\sjm33\.cursor\projects\c-Users-sjm33-voters-app\assets\c__Users_sjm33_AppData_Roaming_Cursor_User_workspaceStorage_01a8addba369c529bbae1b3c1259f320_images_b3-3a89918e-220a-4316-9c8c-1f1e3d9b9008.png`;

const TITLE    = `"버릇 없는 후배 없다" 원태인 태도 논란에 강민호 참지 않았다, 그런데 불이 더 커졌다?`;
const NEWS_URL = "https://www.spotvnews.co.kr/?mod=news&act=articleView&idxno=742860";

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
  const url = svc.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
  console.log(`  ✅ 업로드: ${storagePath}`);
  return url;
}

async function main() {
  const svc = createClient(mustEnv("NEXT_PUBLIC_SUPABASE_URL"), mustEnv("SUPABASE_SERVICE_ROLE_KEY"));

  const { data: profile } = await svc
    .from("profiles")
    .select("nickname")
    .eq("id", AUTHOR_USER_ID)
    .maybeSingle();
  const authorName = (profile as { nickname?: string } | null)?.nickname ?? "만두왕";
  console.log(`작성자: ${authorName}`);

  const folder = `news/${Date.now()}`;
  console.log("\n이미지 업로드 중 (b1 → b2 → b3)...");
  const urlB1 = await uploadImage(svc, IMG_B1, `${folder}/b1.png`);
  const urlB2 = await uploadImage(svc, IMG_B2, `${folder}/b2.png`);
  const urlB3 = await uploadImage(svc, IMG_B3, `${folder}/b3.png`);

  const contentHtml = `
<p style="color:#888;font-size:0.8em;margin:0 0 14px;">
  📰 <strong>스포티비뉴스</strong> &nbsp;|&nbsp; 신원철 기자 &nbsp;|&nbsp; 2026.04.20
</p>
<img src="${urlB1}" alt="기사 본문 1" style="width:100%;max-width:600px;border-radius:10px;display:block;margin-bottom:10px;" />
<img src="${urlB2}" alt="기사 본문 2" style="width:100%;max-width:600px;border-radius:10px;display:block;margin-bottom:10px;" />
<img src="${urlB3}" alt="기사 헤더+사진" style="width:100%;max-width:600px;border-radius:10px;display:block;margin-bottom:16px;" />
<a href="${NEWS_URL}" target="_blank" rel="noopener noreferrer"
   style="display:inline-block;padding:10px 20px;background:#1e293b;color:#fff;border-radius:8px;text-decoration:none;font-size:0.88em;font-weight:600;">
  🔗 원문 기사 보러가기
</a>`.trim();

  const { data: inserted, error } = await svc
    .from("board_posts")
    .insert({
      title: TITLE,
      content: `📰 스포티비뉴스 | 신원철 기자\n${NEWS_URL}`,
      content_html: contentHtml,
      category: "sports",
      sub_category: "국내야구",
      author_id: AUTHOR_USER_ID,
      author_name: authorName,
      thumbnail_url: urlB3, // 사진 포함된 헤더 이미지를 썸네일로
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
  console.log(`   카테고리: sports / 국내야구`);
  console.log(`   작성자: ${authorName}`);
  console.log(`   이미지 순서: b1 → b2 → b3`);
}

main().catch((e) => { console.error(e); process.exit(1); });
