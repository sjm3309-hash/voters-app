import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [{ source: "/suggest", destination: "/customer-center", permanent: true }];
  },
};

export default nextConfig;
