export type Comment = {
  id: string;
  postId: string;
  author: string;
  content: string;
  createdAt: string; // ISO
};

const STORAGE_KEY = "voters.board.comments";

export function loadComments(): Comment[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Comment[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveComments(comments: Comment[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(comments));
  window.dispatchEvent(new Event("voters:commentsUpdated"));
}

export function getCommentsForPost(postId: string): Comment[] {
  return loadComments()
    .filter((c) => c.postId === postId)
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
}

export function addComment(postId: string, content: string, author = "익명"): Comment | null {
  const trimmed = content.trim();
  if (!trimmed) return null;
  const next: Comment = {
    id: `${Date.now()}`,
    postId,
    author,
    content: trimmed,
    createdAt: new Date().toISOString(),
  };
  const all = loadComments();
  all.push(next);
  saveComments(all);
  return next;
}

export function deleteCommentsByPostId(postId: string) {
  const next = loadComments().filter((c) => c.postId !== postId);
  saveComments(next);
}

