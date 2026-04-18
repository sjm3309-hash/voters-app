import { Suspense } from "react";

export default function BoatDetailLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" aria-hidden />}>{children}</Suspense>
  );
}
