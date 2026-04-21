/**
 * 기존 게시글의 base64 data URL 이미지를 Supabase Storage로 마이그레이션
 *
 *   npx tsx scripts/migrate-board-images-to-storage.ts
 *
 * 동작:
 *   1. thumbnail_url 이 'data:' 로 시작하는 게시글 조회
 *   2. base64 → Buffer 변환
 *   3. board-images/posts/migrated/{postId}/thumb.jpg 로 업로드
 *   4. board_posts.thumbnail_url 을 Storage 공개 URL 로 업데이트
 *   5. images 배열도 data URL 이 있으면 동일하게 처리
 */

import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config({ path: ".env.local" });

function mustEnv(name: string): string {
  const v = process.env[name];
  if (!v?.trim()) throw new Error(`Missing env: ${name}`);
  return v.trim();
}

const BUCKET = "board-images";

const svc = createClient(
  mustEnv("NEXT_PUBLIC_SUPABASE_URL"),
  mustEnv("SUPABASE_SERVICE_ROLE_KEY"),
);

/** data URL → { buffer, mimeType } */
function dataUrlToBuffer(dataUrl: string): { buffer: Buffer; mime: string; ext: string } | null {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (!match) return null;
  const mime = match[1];
  const ext = mime === "image/png" ? "png" : mime === "image/gif" ? "gif" : "jpg";
  const buffer = Buffer.from(match[2], "base64");
  return { buffer, mime, ext };
}

/** Storage에 업로드 후 공개 URL 반환 */
async function uploadToStorage(
  buffer: Buffer,
  mime: string,
  path: string,
): Promise<string | null> {
  const { error } = await svc.storage
    .from(BUCKET)
    .upload(path, buffer, {
      contentType: mime,
      upsert: true,
      cacheControl: "31536000",
    });

  if (error) {
    console.error(`  ✗ 업로드 실패 (${path}):`, error.message);
    return null;
  }

  const { data: { publicUrl } } = svc.storage.from(BUCKET).getPublicUrl(path);
  return publicUrl;
}

async function main() {
  console.log("📦 board-images 마이그레이션 시작...\n");

  // 1. data URL 을 가진 게시글 조회
  const { data: posts, error } = await svc
    .from("board_posts")
    .select("id, thumbnail_url, images")
    .like("thumbnail_url", "data:%");

  if (error) {
    console.error("조회 실패:", error.message);
    process.exit(1);
  }

  if (!posts || posts.length === 0) {
    console.log("✅ 마이그레이션할 게시글이 없습니다.");
    return;
  }

  console.log(`총 ${posts.length}개 게시글 처리 시작\n`);

  let successCount = 0;
  let failCount = 0;

  for (const post of posts) {
    console.log(`▶ 게시글 ${post.id}`);
    const updates: Record<string, unknown> = {};

    // ── thumbnail_url 마이그레이션 ───────────────────────────────────────
    if (typeof post.thumbnail_url === "string" && post.thumbnail_url.startsWith("data:")) {
      const parsed = dataUrlToBuffer(post.thumbnail_url);
      if (parsed) {
        const path = `posts/migrated/${post.id}/thumb.${parsed.ext}`;
        const url = await uploadToStorage(parsed.buffer, parsed.mime, path);
        if (url) {
          updates.thumbnail_url = url;
          console.log(`  ✓ thumbnail → ${url.slice(0, 80)}...`);
        } else {
          failCount++;
          continue;
        }
      }
    }

    // ── images 배열 마이그레이션 ─────────────────────────────────────────
    if (Array.isArray(post.images) && post.images.length > 0) {
      const newImages: string[] = [];
      for (let i = 0; i < post.images.length; i++) {
        const img = post.images[i];
        if (typeof img === "string" && img.startsWith("data:")) {
          const parsed = dataUrlToBuffer(img);
          if (parsed) {
            const path = `posts/migrated/${post.id}/image_${i}.${parsed.ext}`;
            const url = await uploadToStorage(parsed.buffer, parsed.mime, path);
            newImages.push(url ?? img);
          } else {
            newImages.push(img);
          }
        } else {
          newImages.push(img);
        }
      }
      updates.images = newImages;
    }

    // ── DB 업데이트 ──────────────────────────────────────────────────────
    if (Object.keys(updates).length > 0) {
      const { error: updateError } = await svc
        .from("board_posts")
        .update(updates)
        .eq("id", post.id);

      if (updateError) {
        console.error(`  ✗ DB 업데이트 실패:`, updateError.message);
        failCount++;
      } else {
        console.log(`  ✓ DB 업데이트 완료`);
        successCount++;
      }
    }

    console.log();
  }

  console.log("─".repeat(50));
  console.log(`✅ 완료: ${successCount}개 성공, ${failCount}개 실패`);
}

main().catch((e) => {
  console.error("스크립트 오류:", e);
  process.exit(1);
});
