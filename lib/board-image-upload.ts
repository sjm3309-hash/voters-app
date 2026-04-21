"use client";

/**
 * 게시판 이미지 → Supabase Storage 업로드
 *
 * 업로드 전 클라이언트에서:
 *   - full   : 최대 1200px, JPEG 82% — 상세 페이지용
 *   - thumb  : 최대 600px,  JPEG 70% — 목록/홈 썸네일용
 *
 * 반환: { url: string (full), thumbUrl: string (thumb) }
 * 실패 시: null
 */

const MAX_PICK_BYTES = 10 * 1024 * 1024; // 원본 선택 한도 10MB

const FULL_MAX_SIDE = 1200;
const FULL_QUALITY = 0.82;

const THUMB_MAX_SIDE = 600;
const THUMB_QUALITY = 0.70;

export interface BoardImageUploadResult {
  /** 상세 페이지에서 보여줄 원본 크기 URL */
  url: string;
  /** 목록/홈에서 보여줄 썸네일 URL */
  thumbUrl: string;
}

// ── 내부 유틸리티 ────────────────────────────────────────────────────────────

async function resizeToBlob(
  file: File,
  maxSide: number,
  quality: number,
): Promise<Blob | null> {
  try {
    const bmp = await createImageBitmap(file);
    try {
      let w = bmp.width;
      let h = bmp.height;
      if (w <= 0 || h <= 0) return null;

      if (w > maxSide || h > maxSide) {
        if (w >= h) {
          h = Math.max(1, Math.round((h * maxSide) / w));
          w = maxSide;
        } else {
          w = Math.max(1, Math.round((w * maxSide) / h));
          h = maxSide;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      ctx.drawImage(bmp, 0, 0, w, h);

      return await new Promise<Blob | null>((res) =>
        canvas.toBlob(res, "image/jpeg", quality),
      );
    } finally {
      bmp.close();
    }
  } catch {
    return null;
  }
}

async function uploadBlobToStorage(blob: Blob): Promise<string | null> {
  const form = new FormData();
  form.append("file", blob, "image.jpg");
  try {
    const res = await fetch("/api/board-images", {
      method: "POST",
      body: form,
      credentials: "same-origin",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { ok: boolean; url?: string };
    return json.ok && json.url ? json.url : null;
  } catch {
    return null;
  }
}

// ── 공개 API ─────────────────────────────────────────────────────────────────

/**
 * 이미지 파일을 리사이징 후 Storage에 업로드.
 * full(상세용) + thumb(목록용) 두 벌 업로드.
 */
export async function uploadBoardImage(
  file: File,
): Promise<BoardImageUploadResult | null> {
  if (!file.type.startsWith("image/")) return null;
  if (file.size > MAX_PICK_BYTES) return null;

  const [fullBlob, thumbBlob] = await Promise.all([
    resizeToBlob(file, FULL_MAX_SIDE, FULL_QUALITY),
    resizeToBlob(file, THUMB_MAX_SIDE, THUMB_QUALITY),
  ]);

  if (!fullBlob || !thumbBlob) return null;

  const [url, thumbUrl] = await Promise.all([
    uploadBlobToStorage(fullBlob),
    uploadBlobToStorage(thumbBlob),
  ]);

  if (!url || !thumbUrl) return null;
  return { url, thumbUrl };
}

export const BOARD_IMAGE_MAX_PICK_MB = MAX_PICK_BYTES / (1024 * 1024);
