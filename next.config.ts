import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "sports-phinf.pstatic.net" },
      { protocol: "https", hostname: "nng-phinf.pstatic.net" },
      { protocol: "https", hostname: "r2.thesportsdb.com" },
    ],
  },
};

export default nextConfig;
