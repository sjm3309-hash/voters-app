import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { LoginClient } from "./login-client";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="size-8 animate-spin text-chart-5" />
        </div>
      }
    >
      <LoginClient />
    </Suspense>
  );
}
