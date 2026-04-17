"use client";

import { createClient } from "@/utils/supabase/client";

export type CustomerCenterCategory = "inquiry" | "proposal";

export type CustomerCenterPostRow = {
  id: string;
  user_id: string;
  title: string;
  content: string;
  category: CustomerCenterCategory;
  is_private: boolean;
  like_count: number;
  author_display_name: string | null;
  created_at: string;
  updated_at: string;
};

export async function fetchMyInquiries(): Promise<{
  data: CustomerCenterPostRow[] | null;
  error: Error | null;
}> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) return { data: [], error: null };

  const { data, error } = await supabase
    .from("customer_center_posts")
    .select("*")
    .eq("category", "inquiry")
    .order("created_at", { ascending: false });

  return { data: (data as CustomerCenterPostRow[]) ?? null, error: error ? new Error(error.message) : null };
}

export async function fetchProposals(
  order: "likes" | "recent",
): Promise<{ data: CustomerCenterPostRow[] | null; error: Error | null }> {
  const supabase = createClient();
  let q = supabase
    .from("customer_center_posts")
    .select("*")
    .eq("category", "proposal");

  q =
    order === "likes"
      ? q.order("like_count", { ascending: false }).order("created_at", { ascending: false })
      : q.order("created_at", { ascending: false });

  const { data, error } = await q;
  return { data: (data as CustomerCenterPostRow[]) ?? null, error: error ? new Error(error.message) : null };
}

export async function createCustomerCenterPost(input: {
  title: string;
  content: string;
  category: CustomerCenterCategory;
}): Promise<{ id: string | null; error: Error | null }> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) return { id: null, error: new Error("로그인이 필요합니다.") };

  const display =
    (user.user_metadata?.nickname ??
      user.user_metadata?.full_name ??
      user.user_metadata?.name ??
      user.email?.split("@")?.[0] ??
      "") || null;

  const isPrivate = input.category === "inquiry";

  const { data, error } = await supabase
    .from("customer_center_posts")
    .insert({
      user_id: user.id,
      title: input.title,
      content: input.content,
      category: input.category,
      is_private: isPrivate,
      author_display_name: display,
    })
    .select("id")
    .single();

  return { id: (data as any)?.id ?? null, error: error ? new Error(error.message) : null };
}

export async function fetchCustomerCenterPostById(id: string): Promise<{
  data: CustomerCenterPostRow | null;
  error: Error | null;
}> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("customer_center_posts")
    .select("*")
    .eq("id", id)
    .single();

  return { data: (data as CustomerCenterPostRow) ?? null, error: error ? new Error(error.message) : null };
}

export async function fetchUserLikedProposalIds(postIds: string[]): Promise<Set<string>> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid || postIds.length === 0) return new Set();

  const { data, error } = await supabase
    .from("customer_center_likes")
    .select("post_id")
    .eq("user_id", uid)
    .in("post_id", postIds);

  if (error || !Array.isArray(data)) return new Set();
  return new Set((data as any[]).map((r) => r.post_id).filter(Boolean));
}

export async function toggleProposalLike(args: {
  postId: string;
  currentlyLiked: boolean;
}): Promise<{ liked: boolean; likeCount: number; error: Error | null }> {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) return { liked: false, likeCount: 0, error: new Error("로그인이 필요합니다.") };

  // like table update
  if (args.currentlyLiked) {
    const { error } = await supabase
      .from("customer_center_likes")
      .delete()
      .eq("post_id", args.postId)
      .eq("user_id", uid);
    if (error) return { liked: true, likeCount: 0, error: new Error(error.message) };
  } else {
    const { error } = await supabase
      .from("customer_center_likes")
      .insert({ post_id: args.postId, user_id: uid });
    if (error) return { liked: false, likeCount: 0, error: new Error(error.message) };
  }

  // recompute count (simple + consistent with RLS)
  const { count } = await supabase
    .from("customer_center_likes")
    .select("*", { count: "exact", head: true })
    .eq("post_id", args.postId);

  const nextCount = typeof count === "number" ? count : 0;
  await supabase
    .from("customer_center_posts")
    .update({ like_count: nextCount })
    .eq("id", args.postId);

  return { liked: !args.currentlyLiked, likeCount: nextCount, error: null };
}

