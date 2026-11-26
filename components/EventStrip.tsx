import Link from "next/link";
import type { SportEvent } from "@/lib/types";
import { diffDays, formatDateKo, formatTimeKo } from "@/lib/kst";
import { INTEREST_STYLE, interestCategoryOf } from "@/lib/interests";

function dday(event: SportEvent, today: string): string {
  if (event.status === "진행중") return "LIVE";
  const days = diffDays(today, event.dateKey);
  return days <= 0 ? "오늘" : `D-${days}`;
}

/** 첫 화면용 일정 줄. 저장·공유 같은 기능은 /schedule 에만 둔다. */
export function EventStrip({ events, today }: { events: SportEvent[]; today: string }) {
  if (events.length === 0) return null;
  return (
    <section className="strip" aria-labelledby="strip-title">
      <header className="block-head">
        <div>
          <p className="eyebrow">볼 각 / 이번 주 일정</p>
          <h2 id="strip-title">달력에 표시할 것</h2>
        </div>
        <Link href="/schedule" className="block-more">
          30일 일정 전체 <span aria-hidden>→</span>
        </Link>
      </header>
      <ol className="strip-list">
        {events.map((event) => {
          const category = interestCategoryOf(event);
          const live = event.status === "진행중";
          return (
            <li key={event.id} className={live ? "strip-item strip-item-live" : "strip-item"}>
              <span className="strip-dday">{dday(event, today)}</span>
              <span className="strip-main">
                <small>
                  <i className={INTEREST_STYLE[category].dot} aria-hidden />
                  {category} · {event.series ?? event.league}
                </small>
                <strong>
                  {event.home && event.away ? `${event.home.name} vs ${event.away.name}` : event.title}
                </strong>
              </span>
              <span className="strip-when">
                {formatDateKo(event.dateKey)}
                <small>{event.timeTbd ? "시간 미정" : formatTimeKo(event.startsAt)}</small>
              </span>
              <span className="strip-hype">
                <small>HYPE</small>
                {event.hype}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
