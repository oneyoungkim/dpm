import { Fragment } from "react";
import Link from "next/link";
import type { SportEvent } from "@/lib/types";
import { broadcastOf } from "@/lib/broadcast";
import { diffDays, formatDateKo, formatTimeKo } from "@/lib/kst";
import { INTEREST_STYLE, interestCategoryOf } from "@/lib/interests";
import { MAIN_EVENT_DAYS } from "@/lib/main-event";
import { Countdown } from "./Countdown";

/** D-day 이름표. Countdown(클라이언트)과 같은 규칙. */
function ddayLabel(event: SportEvent, today: string): string {
  if (event.status === "진행중") return "LIVE";
  const days = diffDays(today, event.dateKey);
  return days <= 0 ? "오늘" : `D-${days}`;
}

/** 날짜 줄 아래 중계 한 줄. 확인된 중계처가 없으면 그리지 않는다. */
function HeroBroadcast({ event }: { event: SportEvent }) {
  const line = broadcastOf(event);
  if (!line) return null;
  return (
    <p className="bc bc-hero">
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
    </p>
  );
}

/** 첫 화면 맨 위 카드. mainEventOf가 고른 일정 하나를 크게 보여 준다. */
export function MainEventHero({
  event,
  today,
  article,
}: {
  event: SportEvent;
  today: string;
  /** 이 일정의 소개 글(있으면) */
  article?: { slug: string; title: string };
}) {
  const category = interestCategoryOf(event);
  const live = event.status === "진행중";
  const thisWeek = diffDays(today, event.dateKey) <= MAIN_EVENT_DAYS;
  const title = event.home && event.away ? `${event.home.name} vs ${event.away.name}` : event.title;
  const league = [category, event.series ?? event.league, event.round].filter(Boolean).join(" · ");

  return (
    <section className={live ? "mev mev-live" : "mev"} aria-labelledby="mev-title">
      <div className="mev-head">
        <p className="eyebrow">볼 각 / {thisWeek ? "이번 주" : "다가오는"} 메인</p>
        <p className="mev-league">
          <i className={INTEREST_STYLE[category].dot} aria-hidden />
          {league}
        </p>
        <h2 id="mev-title" className="mev-title">
          {title}
        </h2>
      </div>

      <div className="mev-count">
        <Countdown
          startsAt={event.startsAt}
          dateKey={event.dateKey}
          timeTbd={event.timeTbd}
          live={live}
          initialLabel={ddayLabel(event, today)}
        />
      </div>

      <div className="mev-info">
        <p className="mev-when">
          <time dateTime={event.startsAt}>
            {formatDateKo(event.dateKey)} · {event.timeTbd ? "시간 미정" : `${formatTimeKo(event.startsAt)} 한국 시간`}
          </time>
          {event.venue ? <span>{event.venue}</span> : null}
        </p>
        <HeroBroadcast event={event} />
        {event.hypeReason ? <p className="mev-reason">{event.hypeReason}</p> : null}
      </div>

      <div className="mev-actions">
        {article ? (
          <Link href={`/magazine/${article.slug}`} className="mev-btn mev-btn-primary">
            소개 글 읽기 <span aria-hidden>→</span>
          </Link>
        ) : null}
        <Link href="/schedule" className={article ? "mev-btn" : "mev-btn mev-btn-primary"}>
          30일 일정 전체 <span aria-hidden>→</span>
        </Link>
      </div>
    </section>
  );
}
