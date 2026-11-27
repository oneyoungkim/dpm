import type { NextConfig } from "next";

/**
 * 대표 주소(NEXT_PUBLIC_SITE_URL)가 정해지면 옛 버셀 주소와 www 주소로 온 사람을 그리로 보낸다.
 * 값이 없으면 아무것도 넘기지 않는다(도메인이 아직 안 붙었을 때 사이트가 끊기지 않게).
 */
function hostRedirects() {
  const site = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");
  if (!site) return [];
  const host = new URL(site).host;
  const from = ["dpm-five.vercel.app", `www.${host}`].filter((h) => h !== host);
  return from.map((value) => ({
    source: "/:path*",
    has: [{ type: "host" as const, value }],
    destination: `${site}/:path*`,
    permanent: true,
  }));
}

const nextConfig: NextConfig = {
  async redirects() {
    return hostRedirects();
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "sports-phinf.pstatic.net" },
      { protocol: "https", hostname: "nng-phinf.pstatic.net" },
      { protocol: "https", hostname: "r2.thesportsdb.com" },
    ],
  },
  // 글·집계·일정 파일은 실행 중에 fs로 읽는다. 페이지를 다시 만들 때(ISR)도 읽히도록 함수 묶음에 넣는다.
  outputFileTracingIncludes: {
    "/**": ["./content/articles/**/*", "./data/*.json", "./assets/fonts/*", "./public/brand/gak-mark-128.png"],
  },
};

export default nextConfig;
