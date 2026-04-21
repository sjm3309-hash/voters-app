-- board-images Storage 버킷 생성 및 RLS 정책
-- 사용자 업로드 이미지를 Supabase Storage에 호스팅

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'board-images',
  'board-images',
  true,
  5242880, -- 5MB
  array['image/jpeg','image/jpg','image/png','image/gif','image/webp']
)
on conflict (id) do nothing;

-- 인증된 사용자: 본인 경로에만 업로드 가능
create policy "board_images_insert"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'board-images'
    and (storage.foldername(name))[1] = 'posts'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- 인증된 사용자: 본인 파일 삭제 가능
create policy "board_images_delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'board-images'
    and (storage.foldername(name))[2] = auth.uid()::text
  );

-- 전체 공개 읽기
create policy "board_images_select"
  on storage.objects for select
  to public
  using (bucket_id = 'board-images');
