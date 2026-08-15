import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./redline.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://dpm-five.vercel.app"),
  title: "MATCHDAY — 남자들이 기다리는 날",
  description:
    "결승전, 대작 출시, 신제품 발표. 달력에 빨간 줄 그을 순간만 모았습니다.",
  manifest: "/manifest.json",
  applicationName: "Matchday",
  keywords: ["스포츠 일정", "게임 출시일", "신제품 발표", "UFC 일정", "축구 일정", "LCK 일정"],
  icons: { icon: "/icon.svg" },
  appleWebApp: {
    capable: true,
    title: "Matchday",
    statusBarStyle: "black-translucent",
  },
  openGraph: {
    title: "MATCHDAY — 남자들이 기다리는 날",
    description: "결승전, 대작 출시, 신제품 발표. 달력에 빨간 줄 그을 순간만.",
    type: "website",
    locale: "ko_KR",
    siteName: "Matchday",
    images: [{ url: "/og-redline.png", width: 1200, height: 630, alt: "MATCHDAY — 남자들이 기다리는 날" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "MATCHDAY — 남자들이 기다리는 날",
    description: "결승전, 대작 출시, 신제품 발표. 달력에 빨간 줄 그을 순간만.",
    images: ["/og-redline.png"],
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
      <body>{children}</body>
    </html>
  );
}
