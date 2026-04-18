import { Suspense } from "react";
import { BoardIndexClient } from "./board-index-client";

export const dynamic = "force-dynamic";

export default function BoardIndexPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <BoardIndexClient />
    </Suspense>
  );
}
