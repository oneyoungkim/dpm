import type { Metadata } from "next";
import { AlertsPanel } from "@/components/app/AlertsPanel";

// 앱의 '알림' 탭. 검색에 실을 페이지가 아니다.
export const metadata: Metadata = {
  title: "알림",
  description: "저장한 일정과 관심 종목 알림 설정",
  robots: { index: false, follow: false },
  alternates: { canonical: "/alerts" },
};

export default function AlertsPage() {
  return (
    <main id="main" className="page alerts-page">
      <header className="page-head">
        <p className="eyebrow">ALERTS</p>
        <h1>알림</h1>
        <p className="page-deck">놓치기 싫은 경기·출시를 시작 전에 알려 드려요.</p>
      </header>
      <AlertsPanel />
    </main>
  );
}
