import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import "./redline.css";
import "./gak.css";
import "./app-shell.css";
import { BRAND, SITE_TITLE } from "@/lib/brand";
import { siteJsonLd } from "@/lib/structured-data";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { JsonLd } from "@/components/JsonLd";
import { AppBridge } from "@/components/app/AppBridge";
import { AppTabBar } from "@/components/app/AppTabBar";
import { WebOnly } from "@/components/app/WebOnly";

/**
 * 휴대폰 앱 안이면(사용자 에이전트에 "GakApp/") 첫 그림 전에 <html class="in-app">을 단다.
 * 앱은 화면 끝까지 그리므로 viewport-fit=cover 도 이때 붙인다. 웹 방문자에게는 아무 일도 없다.
 */
const APP_SHELL_SCRIPT = `(function(){try{var u=navigator.userAgent;if(u.indexOf("GakApp/")<0)return;var d=document.documentElement;d.classList.add("in-app",/Android/i.test(u)?"in-app-android":"in-app-ios");var m=document.querySelector('meta[name="viewport"]');if(m){if(m.content.indexOf("viewport-fit")<0)m.content+=", viewport-fit=cover"}else{m=document.createElement("meta");m.name="viewport";m.content="width=device-width, initial-scale=1, viewport-fit=cover";document.head.appendChild(m)}}catch(e){}})();`;

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
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: APP_SHELL_SCRIPT }} />
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
        <AppTabBar />
        <AppBridge />
        {/* 방문 통계(Vercel Web Analytics): 쿠키 없이 페이지 조회·유입 경로·나라·기기만 묶음으로 센다 */}
        <Analytics />
        {BRAND.adsenseClient ? (
          // 앱 안에서는 광고를 싣지 않는다(애드센스는 앱 웹뷰에 그대로 넣을 수 없다).
          <WebOnly>
            <Script
              id="adsense"
              async
              strategy="afterInteractive"
              crossOrigin="anonymous"
              src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${BRAND.adsenseClient}`}
            />
          </WebOnly>
        ) : null}
      </body>
    </html>
  );
}
