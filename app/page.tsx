import Link from "next/link";
import { loadEvents } from "@/lib/events";
import { addDays, todayKey } from "@/lib/kst";
import { isCuratedEvent } from "@/lib/curation";
import { loadTrends, mainChart } from "@/lib/trends";
import { loadArticles } from "@/lib/articles";
import { BRAND } from "@/lib/brand";
import { RankBoard } from "@/components/RankBoard";
import { ArticleCard } from "@/components/ArticleCard";
import { EventStrip } from "@/components/EventStrip";
import { AdSlot } from "@/components/AdSlot";

/** 집계·크롤·새 글이 들어오면 최대 10분 뒤 반영된다. */
export const revalidate = 600;

export default function Home() {
  const trends = loadTrends();
  const chart = mainChart(trends, 10);
  const articles = loadArticles();
  const [lead, ...rest] = articles;

  const today = todayKey();
  const weekEnd = addDays(today, 7);
  const events = loadEvents()
    .events.filter(
      (event) =>
        event.dateKey >= today &&
        event.dateKey <= weekEnd &&
        event.status !== "취소" &&
        event.status !== "종료" &&
        isCuratedEvent(event),
    )
    .sort((a, b) => b.hype - a.hype || a.startsAt.localeCompare(b.startsAt))
    .slice(0, 6)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));

  return (
    <main id="main" className="home">
      <h1 className="sr-only">
        {BRAND.name} — {BRAND.description}
      </h1>

      <section className={lead ? "home-top" : "home-top home-top-solo"}>
        <RankBoard file={trends} keywords={chart} />
        {lead ? (
          <div className="home-lead">
            <ArticleCard article={lead} variant="lead" priority />
            {rest.slice(0, 3).map((article) => (
              <ArticleCard key={article.slug} article={article} variant="row" />
            ))}
          </div>
        ) : null}
      </section>

      <AdSlot placement="home-top" />

      <EventStrip events={events} today={today} />

      {rest.length > 3 ? (
        <section className="mag-section" aria-labelledby="home-mag-title">
          <header className="block-head">
            <div>
              <p className="eyebrow">읽을 각 / 매거진</p>
              <h2 id="home-mag-title">하루 두 편</h2>
            </div>
            <Link href="/magazine" className="block-more">
              매거진 전체 <span aria-hidden>→</span>
            </Link>
          </header>
          <div className="mag-grid">
            {rest.slice(3, 9).map((article) => (
              <ArticleCard key={article.slug} article={article} />
            ))}
          </div>
        </section>
      ) : null}

      <AdSlot placement="home-mid" />
    </main>
  );
}
