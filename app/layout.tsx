import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import "./redline.css";
import "./gak.css";
import { BRAND } from "@/lib/brand";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";

const TITLE = `${BRAND.name} — ${BRAND.tagline}`;

export const metadata: Metadata = {
  metadataBase: new URL(BRAND.url),
  title: { default: TITLE, template: `%s | ${BRAND.name}` },
  description: BRAND.description,
  manifest: "/manifest.json",
  applicationName: BRAND.name,
  keywords: ["커뮤니티 키워드 순위", "실시간 인기 키워드", "스포츠 일정", "UFC 일정", "게임 출시일", "남자 매거진"],
  icons: { icon: "/icon.svg" },
  alternates: {
    canonical: "/",
    types: { "application/rss+xml": [{ url: "/feed.xml", title: `${BRAND.name} 매거진` }] },
  },
  appleWebApp: { capable: true, title: BRAND.name, statusBarStyle: "black-translucent" },
  openGraph: {
    title: TITLE,
    description: BRAND.description,
    type: "website",
    locale: "ko_KR",
    siteName: BRAND.name,
    url: "/",
  },
  twitter: { card: "summary_large_image", title: TITLE, description: BRAND.description },
  // 구글 디스커버와 검색 결과에 큰 사진이 쓰이도록 허락한다.
  robots: { index: true, follow: true, googleBot: { "max-image-preview": "large", "max-snippet": -1 } },
  verification: {
    google: BRAND.googleVerification || undefined,
    other: {
      ...(BRAND.naverVerification ? { "naver-site-verification": BRAND.naverVerification } : {}),
      ...(BRAND.adsenseClient ? { "google-adsense-account": BRAND.adsenseClient } : {}),
    },
  },
};

export const viewport: Viewport = {
  themeColor: "#050607",
  width: "device-width",
  initialScale: 1,
};

const siteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: BRAND.name,
  alternateName: BRAND.nameKo,
  url: BRAND.url,
  description: BRAND.description,
  inLanguage: "ko-KR",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(siteJsonLd).replace(/</g, "\\u003c") }}
        />
      </head>
      <body>
        <a href="#main" className="skip-link">
          본문으로 건너뛰기
        </a>
        <div className="site-shell">
          <SiteHeader />
          {children}
          <SiteFooter />
        </div>
        {BRAND.adsenseClient ? (
          <Script
            id="adsense"
            async
            strategy="afterInteractive"
            crossOrigin="anonymous"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${BRAND.adsenseClient}`}
          />
        ) : null}
      </body>
    </html>
  );
}
