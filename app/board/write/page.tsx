import { Suspense } from "react";
import { BoardWriteClient } from "./write-client";

export default function BoardWritePage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <BoardWriteClient />
    </Suspense>
  );
}

