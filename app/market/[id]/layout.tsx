import { Suspense } from "react";

export default function MarketDetailLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" aria-hidden />}>
      {children}
    </Suspense>
  );
}
