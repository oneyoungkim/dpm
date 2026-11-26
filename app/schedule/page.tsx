import type { Metadata } from "next";
import { activeInterests, loadEvents, monthHighlights } from "@/lib/events";
import { addDays, todayKey } from "@/lib/kst";
import { ScheduleBrowser } from "@/components/ScheduleBrowser";
import { buildPreviewEvents } from "@/lib/preview-events";
import { isCuratedEvent } from "@/lib/curation";

/** 크롤러가 events.json 을 갈아끼우면 최대 10분 뒤 반영된다. */
export const revalidate = 600;

export const metadata: Metadata = {
  title: "30일 일정",
  description: "축구·야구·UFC·LCK 경기와 게임 출시, 신제품 발표까지. 앞으로 30일 가운데 볼 것만 골랐습니다.",
  alternates: { canonical: "/schedule" },
};

export default function SchedulePage() {
  const data = loadEvents();
  const today = todayKey();
  const lastDay = addDays(today, 30);
  // 명시적으로 켤 때만 예시 데이터를 섞는다. 배포 기본값은 실제 수집 결과만.
  const previewEvents = process.env.MATCHDAY_PREVIEW_EVENTS === "1" ? buildPreviewEvents(today) : [];
  const allEvents = [...data.events, ...previewEvents];
  const upcoming = allEvents.filter(
    (event) =>
      event.dateKey >= today &&
      event.dateKey <= lastDay &&
      event.status !== "취소" &&
      event.status !== "종료",
  );
  const featured = monthHighlights(upcoming, 1)[0] ?? upcoming[0];
  const categories = activeInterests(upcoming);
  const curated = upcoming.filter(isCuratedEvent);

  const generated =
    data.events.length > 0
      ? new Date(data.generatedAt).toLocaleString("ko-KR", {
          timeZone: "Asia/Seoul",
          month: "long",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;

  return (
    <main id="main" className="schedule-page">
      {allEvents.length === 0 ? (
        <section id="top" className="empty-state">
          <p className="eyebrow">NO EVENTS YET</p>
          <h1>아직 수집된 일정이 없습니다.</h1>
          <p>일정이 업데이트되면 앞으로 30일의 추천 이벤트가 이곳에 나타납니다.</p>
        </section>
      ) : (
        <ScheduleBrowser
          events={upcoming}
          today={today}
          activeCategories={categories}
          featuredId={featured?.id}
          curatedCount={curated.length}
          liveCount={curated.filter((event) => event.status === "진행중").length}
        />
      )}
      <p className="schedule-stamp">마지막 수집 {generated ?? "대기 중"} · 한국 시간 기준</p>
    </main>
  );
}
