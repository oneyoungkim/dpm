import type { Metadata } from "next";
import Link from "next/link";
import { loadEvents } from "@/lib/events";
import { addDays, todayKey } from "@/lib/kst";
import { isCuratedEvent } from "@/lib/curation";
import { loadTrends, mainChart } from "@/lib/trends";
import { articlesByEventId, loadArticles } from "@/lib/articles";
import { mainEventOf } from "@/lib/main-event";
import { BRAND } from "@/lib/brand";
import { pageMetadata } from "@/lib/seo";
import { RankBoard } from "@/components/RankBoard";
import { ArticleCard } from "@/components/ArticleCard";
import { EventStrip } from "@/components/EventStrip";
import { AdSlot } from "@/components/AdSlot";
import { MainEventHero } from "@/components/MainEventHero";
import { Reveal } from "@/components/Reveal";

/** 집계·크롤·새 글이 들어오면 최대 10분 뒤 반영된다. */
export const revalidate = 600;

export const metadata: Metadata = pageMetadata({ description: BRAND.description, path: "/" });

export default function Home() {
  const trends = loadTrends();
  const chart = mainChart(trends, 10);
  const articles = loadArticles();
  const [lead, ...rest] = articles;

  const today = todayKey();
  const weekEnd = addDays(today, 7);
  const allEvents = loadEvents().events;
  // 매거진 소개 글과 같은 기준(lib/main-event.ts)으로 고른다.
  const main = mainEventOf(allEvents, today);
  const reads = articlesByEventId();
  const events = allEvents
    .filter(
      (event) =>
        event.id !== main?.id &&
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
        {BRAND.name} {BRAND.domain} — {BRAND.description}
      </h1>

      {main ? (
        <Reveal index={0}>
          <MainEventHero event={main} today={today} article={reads.get(main.id)} />
        </Reveal>
      ) : null}

      <Reveal index={1}>
        <EventStrip events={events} today={today} articles={reads} />
      </Reveal>

      <AdSlot placement="home-top" />

      <Reveal index={2}>
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
      </Reveal>

      {rest.length > 3 ? (
        <Reveal index={3}>
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
        </Reveal>
      ) : null}

      <AdSlot placement="home-mid" />
    </main>
  );
}
