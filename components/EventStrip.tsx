import { Fragment } from "react";
import Link from "next/link";
import type { SportEvent } from "@/lib/types";
import { broadcastOf } from "@/lib/broadcast";
import { diffDays, formatDateKo, formatTimeKo } from "@/lib/kst";
import { INTEREST_STYLE, interestCategoryOf } from "@/lib/interests";

function dday(event: SportEvent, today: string): string {
  if (event.status === "진행중") return "LIVE";
  const days = diffDays(today, event.dateKey);
  return days <= 0 ? "오늘" : `D-${days}`;
}

/** 제목 아래 작은 중계 줄. strip-main 이 span 이라 여기도 span 으로 짓는다. */
function StripBroadcast({ event }: { event: SportEvent }) {
  const line = broadcastOf(event);
  if (!line) return null;
  return (
    <span className="bc bc-strip">
      <span className="bc-label">중계</span>
      {line.outlets.map((outlet, index) => (
        <Fragment key={outlet.name}>
          {index > 0 ? <span className="bc-sep"> · </span> : null}
          {outlet.url ? (
            <a href={outlet.url} target="_blank" rel="noopener" className="bc-name">
              {outlet.name}
            </a>
          ) : (
            <span className="bc-name">{outlet.name}</span>
          )}
          {outlet.paid ? <small className="bc-paid">유료</small> : null}
        </Fragment>
      ))}
      {line.note ? <span className="bc-note">{line.note}</span> : null}
    </span>
  );
}

/** 첫 화면용 일정 줄. 저장·공유 같은 기능은 /schedule 에만 둔다. */
export function EventStrip({
  events,
  today,
  articles,
}: {
  events: SportEvent[];
  today: string;
  /** 일정 id → 소개 글. 있으면 줄 끝에 링크를 단다. */
  articles?: ReadonlyMap<string, { slug: string; title: string }>;
}) {
  if (events.length === 0) return null;
  const withReads = events.some((event) => articles?.has(event.id));
  return (
    <section className="strip" aria-labelledby="strip-title">
      <header className="block-head">
        <div>
          <p className="eyebrow">볼 각 / 주간 일정</p>
          <h2 id="strip-title">이번 주 경기·출시</h2>
        </div>
        <Link href="/schedule" className="block-more">
          30일 일정 전체 <span aria-hidden>→</span>
        </Link>
      </header>
      <ol className={withReads ? "strip-list strip-list-reads" : "strip-list"}>
        {events.map((event) => {
          const category = interestCategoryOf(event);
          const live = event.status === "진행중";
          const article = articles?.get(event.id);
          const title = event.home && event.away ? `${event.home.name} vs ${event.away.name}` : event.title;
          return (
            <li key={event.id} className={live ? "strip-item strip-item-live" : "strip-item"}>
              <span className="strip-dday">{dday(event, today)}</span>
              <span className="strip-main">
                <small>
                  <i className={INTEREST_STYLE[category].dot} aria-hidden />
                  {category} · {event.series ?? event.league}
                </small>
                <strong>{title}</strong>
                <StripBroadcast event={event} />
              </span>
              <span className="strip-when">
                {formatDateKo(event.dateKey)}
                <small>{event.timeTbd ? "시간 미정" : formatTimeKo(event.startsAt)}</small>
              </span>
              <span className="strip-hype">
                <small>HYPE</small>
                {event.hype}
              </span>
              {withReads ? (
                article ? (
                  <Link href={`/magazine/${article.slug}`} className="strip-read" aria-label={`${title} 소개 글 읽기`}>
                    소개 글 <span aria-hidden>→</span>
                  </Link>
                ) : (
                  <span aria-hidden />
                )
              ) : null}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
