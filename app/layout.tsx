import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "Matchday — 앞으로 30일, 기다릴 만한 경기",
  description:
    "축구, UFC, 야구, e스포츠까지. 앞으로 30일 안에 놓치면 아쉬운 이벤트를 한눈에 확인하세요.",
  manifest: "/manifest.json",
  applicationName: "Matchday",
  keywords: ["스포츠 일정", "UFC 일정", "축구 일정", "LCK 일정", "경기 일정"],
  icons: { icon: "/icon.svg" },
  appleWebApp: {
    capable: true,
    title: "Matchday",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: "Matchday — 앞으로 30일, 기다릴 만한 경기",
    description: "축구, UFC, 야구, e스포츠까지. 놓치면 아쉬운 다음 순간만 골랐습니다.",
    type: "website",
    locale: "ko_KR",
    siteName: "Matchday",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Matchday — 앞으로 30일, 기다릴 만한 것만" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Matchday — 앞으로 30일, 기다릴 만한 경기",
    description: "축구, UFC, 야구, e스포츠까지. 놓치면 아쉬운 다음 순간만 골랐습니다.",
    images: ["/og.png"],
  },
};

export const viewport: Viewport = {
  themeColor: "#090a0b",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
