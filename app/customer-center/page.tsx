import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { CustomerCenterClient } from "./customer-center-client";

export default function CustomerCenterPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="size-8 animate-spin text-chart-5" />
        </div>
      }
    >
      <CustomerCenterClient />
    </Suspense>
  );
}

