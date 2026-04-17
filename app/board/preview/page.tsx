import { Suspense } from "react";
import { BoardPreviewClient } from "./preview-client";

export default function BoardPreviewPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <BoardPreviewClient />
    </Suspense>
  );
}

