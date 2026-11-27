import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import "./redline.css";
import "./gak.css";
import { BRAND, SITE_TITLE } from "@/lib/brand";
import { siteJsonLd } from "@/lib/structured-data";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { JsonLd } from "@/components/JsonLd";

/**
 * 사이트 공통 메타데이터.
 * canonical·공유 주소는 페이지마다 lib/seo.ts 의 pageMetadata 로 적는다.
 * (여기에 canonical "/" 을 두면 그것을 적지 않은 페이지가 모두 첫 화면을 대표 주소로 내세운다.)
 */
export const metadata: Metadata = {
  metadataBase: new URL(BRAND.url),
  title: { default: SITE_TITLE, template: `%s | ${BRAND.name}` },
  description: BRAND.description,
  manifest: "/manifest.json",
  applicationName: BRAND.name,
  keywords: [
    BRAND.name,
    BRAND.domain,
    "커뮤니티 키워드 순위",
    "실시간 인기 키워드",
    "스포츠 일정",
    "UFC 일정",
    "게임 출시일",
    "남자 매거진",
  ],
  // G 아이콘. 구글 검색 결과의 사이트 아이콘은 48px 배수를 권하므로 48(ico)·96·192를 함께 둔다.
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48" },
      { url: "/brand/gak-icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/gak-icon-96.png", sizes: "96x96", type: "image/png" },
      { url: "/brand/gak-icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/brand/gak-icon-180.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: { capable: true, title: BRAND.name, statusBarStyle: "black-translucent" },
  openGraph: {
    title: SITE_TITLE,
    description: BRAND.description,
    type: "website",
    locale: "ko_KR",
    siteName: BRAND.name,
  },
  twitter: { card: "summary_large_image", title: SITE_TITLE, description: BRAND.description },
  // 구글 디스커버와 검색 결과에 큰 사진이 쓰이도록 허락한다.
  robots: { index: true, follow: true, googleBot: { "max-image-preview": "large", "max-snippet": -1 } },
  // 서치 콘솔·네이버 서치어드바이저 소유 확인, 애드센스 사이트 확인용 meta. 값이 없으면 싣지 않는다.
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        <link rel="preconnect" href="https://cdn.jsdelivr.net" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        <JsonLd data={siteJsonLd()} />
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
