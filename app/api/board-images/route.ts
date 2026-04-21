import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceRoleClient } from "@/utils/supabase/service-role";

const BUCKET = "board-images";
const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5MB

/**
 * POST /api/board-images
 * multipart/form-data: "file" 필드에 이미지 Blob
 * → Supabase Storage에 업로드 후 공개 URL 반환
 */
export async function POST(request: Request) {
  try {
    const auth = await createClient();
    const {
      data: { user },
    } = await auth.auth.getUser();

    if (!user?.id) {
      return NextResponse.json(
        { ok: false, error: "unauthorized", message: "로그인이 필요합니다." },
        { status: 401 },
      );
    }

    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return NextResponse.json(
        { ok: false, error: "invalid_form", message: "multipart/form-data 형식이 아닙니다." },
        { status: 400 },
      );
    }

    const file = formData.get("file");
    if (!(file instanceof Blob)) {
      return NextResponse.json(
        { ok: false, error: "no_file", message: "file 필드가 없습니다." },
        { status: 400 },
      );
    }

    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { ok: false, error: "too_large", message: "파일이 5MB를 초과합니다." },
        { status: 400 },
      );
    }

    const mime = file.type || "image/jpeg";
    if (!mime.startsWith("image/")) {
      return NextResponse.json(
        { ok: false, error: "invalid_type", message: "이미지 파일만 업로드할 수 있습니다." },
        { status: 400 },
      );
    }

    const ext = mime === "image/png" ? "png" : mime === "image/gif" ? "gif" : "jpg";
    const randomId = Math.random().toString(36).slice(2, 10);
    const path = `posts/${user.id}/${Date.now()}-${randomId}.${ext}`;

    const svc = createServiceRoleClient();
    const arrayBuffer = await file.arrayBuffer();

    const { error: uploadError } = await svc.storage
      .from(BUCKET)
      .upload(path, arrayBuffer, {
        contentType: mime,
        upsert: false,
        cacheControl: "31536000", // 1년 브라우저 캐시
      });

    if (uploadError) {
      console.error("[board-images POST] upload error:", uploadError.message);
      return NextResponse.json(
        { ok: false, error: "upload_failed", message: uploadError.message },
        { status: 500 },
      );
    }

    const {
      data: { publicUrl },
    } = svc.storage.from(BUCKET).getPublicUrl(path);

    return NextResponse.json({ ok: true, url: publicUrl });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[board-images POST]", msg);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
