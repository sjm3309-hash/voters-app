export function sanitizeHtml(input: string): string {
  // Minimal hardening: strip <script> tags so React doesn't warn/error.
  // (This app stores user HTML in localStorage; we intentionally avoid executing scripts.)
  return String(input || "").replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "");
}

