/**
 * 게시글 첨부용 이미지 → data URL
 * - 선택은 더 큰 원본을 허용하고, 전송 전 JPEG로 압축해 Vercel 등 요청 본문 한도에 맞춤
 */

const MAX_PICK_BYTES = 10 * 1024 * 1024; // 원본 10MB까지 선택 가능
/** 압축 결과(blob) 목표. 3장 + 본문이 플랫폼 ~4.5MB 한도 안에 들어가도록 보수적 */
const TARGET_JPEG_BYTES = 850 * 1024;
const MAX_CANVAS_SIDE = 2560;
/** 이 크기 이하는 재압축 없이 그대로(이미 작은 파일) */
const PASS_THROUGH_MAX_BYTES = 600 * 1024;

function readFileAsDataUrl(file: File): Promise<string | null> {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(typeof r.result === "string" ? r.result : null);
    r.onerror = () => resolve(null);
    r.readAsDataURL(file);
  });
}

function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const r = new FileReader();
    r.onload = () => resolve(typeof r.result === "string" ? r.result : null);
    r.onerror = () => resolve(null);
    r.readAsDataURL(blob);
  });
}

/**
 * 이미지 파일을 data URL로 변환. 큰 파일은 해상도·품질을 내려 TARGET 근처로 맞춤.
 */
export async function boardImageFileToDataUrl(file: File): Promise<string | null> {
  if (!file.type.startsWith("image/")) return null;
  if (file.size > MAX_PICK_BYTES) return null;

  if (file.size <= PASS_THROUGH_MAX_BYTES) {
    return readFileAsDataUrl(file);
  }

  try {
    const bmp = await createImageBitmap(file);
    try {
      let w = bmp.width;
      let h = bmp.height;
      if (w <= 0 || h <= 0) {
        return file.size <= 2 * 1024 * 1024 ? readFileAsDataUrl(file) : null;
      }

      if (w > MAX_CANVAS_SIDE || h > MAX_CANVAS_SIDE) {
        if (w >= h) {
          h = Math.max(1, Math.round((h * MAX_CANVAS_SIDE) / w));
          w = MAX_CANVAS_SIDE;
        } else {
          w = Math.max(1, Math.round((w * MAX_CANVAS_SIDE) / h));
          h = MAX_CANVAS_SIDE;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return file.size <= 2 * 1024 * 1024 ? readFileAsDataUrl(file) : null;

      ctx.drawImage(bmp, 0, 0, w, h);

      let q = 0.92;
      let best: string | null = null;
      for (let i = 0; i < 14; i++) {
        const blob = await new Promise<Blob | null>((res) =>
          canvas.toBlob((b) => res(b), "image/jpeg", q),
        );
        if (!blob) break;
        if (blob.size <= TARGET_JPEG_BYTES) {
          best = await blobToDataUrl(blob);
          break;
        }
        if (q <= 0.52) {
          best = await blobToDataUrl(blob);
          break;
        }
        q -= 0.04;
      }
      if (best) return best;
    } finally {
      bmp.close();
    }
  } catch {
    /* HEIC/일부 브라우저 등 */
  }

  if (file.size <= 2 * 1024 * 1024) return readFileAsDataUrl(file);
  return null;
}

export const BOARD_IMAGE_MAX_PICK_MB = MAX_PICK_BYTES / (1024 * 1024);
