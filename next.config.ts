import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "sports-phinf.pstatic.net" },
      { protocol: "https", hostname: "nng-phinf.pstatic.net" },
      { protocol: "https", hostname: "r2.thesportsdb.com" },
    ],
  },
  // 글·집계·일정 파일은 실행 중에 fs로 읽는다. 페이지를 다시 만들 때(ISR)도 읽히도록 함수 묶음에 넣는다.
  outputFileTracingIncludes: {
    "/**": ["./content/articles/**/*", "./data/*.json", "./assets/fonts/*"],
  },
};

export default nextConfig;
