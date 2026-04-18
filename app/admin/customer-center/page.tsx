import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { CustomerCenterAdminClient } from "./customer-center-admin-client";

export default function AdminCustomerCenterPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-background">
          <Loader2 className="size-8 animate-spin text-chart-5" />
        </div>
      }
    >
      <CustomerCenterAdminClient />
    </Suspense>
  );
}
