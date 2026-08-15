import { activeInterests, loadEvents, monthHighlights } from "@/lib/events";
import { addDays, formatDateKo, todayKey } from "@/lib/kst";
import { ScheduleBrowser } from "@/components/ScheduleBrowser";
import { buildPreviewEvents } from "@/lib/preview-events";

/** 크롤러가 events.json 을 갈아끼우면 최대 10분 뒤 반영된다. */
export const revalidate = 600;

export default function Home() {
  const data = loadEvents();
  const today = todayKey();
  const lastDay = addDays(today, 30);
  const previewEvents =
    process.env.MATCHDAY_PREVIEW_EVENTS === "0" ? [] : buildPreviewEvents(today);
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
  const curated = upcoming.filter((event) => event.hype >= 70);
  const curatedCount = curated.length;
  const liveCount = curated.filter((event) => event.status === "진행중").length;

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
    <main className="site-shell">
      <header className="site-header">
        <a href="#top" className="wordmark" aria-label="도파민브로스 처음으로">
          DPMBROS<span className="wordmark-dot" />
        </a>
        <p className="header-tagline">도파민브로스</p>
        <div className="header-date">
          <span className="header-live"><i aria-hidden /> SIGNAL ON</span>
          <span>KST</span>
          {formatDateKo(today)}
        </div>
      </header>

      {allEvents.length === 0 ? (
        <section id="top" className="empty-state">
          <p className="eyebrow">NO EVENTS YET</p>
          <h2>아직 수집된 일정이 없습니다.</h2>
          <p>일정이 업데이트되면 앞으로 30일의 추천 이벤트가 이곳에 나타납니다.</p>
        </section>
      ) : (
        <ScheduleBrowser
          events={upcoming}
          today={today}
          activeCategories={categories}
          featuredId={featured?.id}
          curatedCount={curatedCount}
          liveCount={liveCount}
        />
      )}

      <footer className="site-footer">
        <div>
          <span className="wordmark footer-wordmark">DPMBROS.</span>
          <p>달력에 빨간 줄 그을 순간만.</p>
        </div>
        <div className="footer-meta">
          <p>모든 일정은 한국 시간(KST) 기준</p>
          <p>마지막 업데이트 {generated ?? "업데이트 대기 중"}</p>
          <p>일정과 대진은 주최 측 사정으로 변경될 수 있습니다.</p>
        </div>
      </footer>
    </main>
  );
}
