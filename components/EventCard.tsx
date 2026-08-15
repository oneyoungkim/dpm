"use client";

import type { SportEvent, Team } from "@/lib/types";
import { diffDays, formatDateKo, formatTimeKo } from "@/lib/kst";
import { INTEREST_STYLE, interestCategoryOf } from "@/lib/interests";

function TeamMark({ team, large = false }: { team: Team; large?: boolean }) {
  if (team.logo) {
    return (
      // 외부 이미지 호스트가 계속 늘어나는 구조라 원본을 지연 로딩한다.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={team.logo}
        alt=""
        loading="lazy"
        onError={(event) => {
          event.currentTarget.style.display = "none";
        }}
        className={large ? "team-mark team-mark-large" : "team-mark"}
      />
    );
  }

  return (
    <span className={large ? "team-fallback team-mark-large" : "team-fallback"} aria-hidden>
      {team.name.slice(0, 2)}
    </span>
  );
}

function ddayLabel(event: SportEvent, today: string) {
  if (event.status === "진행중") return "LIVE";
  const days = diffDays(today, event.dateKey);
  if (days <= 0) return "TODAY";
  return `D-${days}`;
}

function verificationLabel(event: SportEvent) {
  if (event.preview) return "레이더 미리보기";
  if (event.confidence === "rumored") return "확인 중";
  if (event.confidence === "expected") return "예상 일정";
  return "공식 확정";
}

function EventActions({
  event,
  saved,
  onToggleSaved,
  onShare,
  shared,
}: {
  event: SportEvent;
  saved: boolean;
  onToggleSaved: (id: string) => void;
  onShare: (event: SportEvent) => void;
  shared: boolean;
}) {
  return (
    <div className="card-actions">
      <button
        type="button"
        onClick={() => onToggleSaved(event.id)}
        aria-pressed={saved}
        className={saved ? "action-button action-button-active" : "action-button"}
      >
        {saved ? "기대 중 ✓" : "기대 걸기"}
      </button>
      <button
        type="button"
        onClick={() => onShare(event)}
        className="action-button action-button-quiet"
        aria-label={`${event.title} 공유하기`}
      >
        {shared ? "복사됨" : "공유"}
      </button>
    </div>
  );
}

export function EventCard({
  event,
  today,
  saved,
  onToggleSaved,
  onShare,
  shared,
  featured = false,
}: {
  event: SportEvent;
  today: string;
  saved: boolean;
  onToggleSaved: (id: string) => void;
  onShare: (event: SportEvent) => void;
  shared: boolean;
  featured?: boolean;
}) {
  const eventCategory = interestCategoryOf(event);
  const style = INTEREST_STYLE[eventCategory];
  const live = event.status === "진행중";
  const matchup = event.home && event.away ? [event.home, event.away] : null;
  const dayLabel = ddayLabel(event, today);

  if (featured) {
    return (
      <article className="feature-card">
        <div className={`feature-glow ${style.bar}`} aria-hidden />
        <div className="feature-scanlines" aria-hidden />
        <div className="feature-redline" aria-hidden />
        <div className="feature-ghost" aria-hidden>
          {dayLabel}
        </div>
        <div className="feature-topline">
          <span className="feature-kicker">
            <i className={style.dot} aria-hidden />
            MAIN EVENT // {eventCategory}
          </span>
          <span className="hype-score">
            <small>HYPE</small> {event.hype}
          </span>
        </div>

        <div className="feature-content">
          <div className="feature-status">
            {live && <span className="live-pip" aria-hidden />}
            {dayLabel}
          </div>
          <p className="feature-league">
            {eventCategory} · {event.series ?? event.league}
            {event.round ? ` · ${event.round}` : ""}
            {event.preview ? <span className="preview-label">관심사 미리보기</span> : null}
          </p>

          {matchup ? (
            <div className="feature-matchup">
              <div className="feature-team">
                <TeamMark team={matchup[0]} large />
                <strong>{matchup[0].name}</strong>
              </div>
              <span className="versus">VS</span>
              <div className="feature-team feature-team-away">
                <TeamMark team={matchup[1]} large />
                <strong>{matchup[1].name}</strong>
              </div>
            </div>
          ) : (
            <h2 className="feature-title">{event.title}</h2>
          )}

          <div className="feature-bottom">
            <div>
              <p className="feature-reason">{event.hypeReason || "이번 달, 놓치면 아쉬운 순간."}</p>
              <p className="feature-time">
                {formatDateKo(event.dateKey)} · {event.timeTbd ? "시간 미정" : formatTimeKo(event.startsAt)} KST
              </p>
              <p className="verification-line">
                <span>{verificationLabel(event)}</span> {event.source}
              </p>
            </div>
            <EventActions
              event={event}
              saved={saved}
              onToggleSaved={onToggleSaved}
              onShare={onShare}
              shared={shared}
            />
          </div>
        </div>
      </article>
    );
  }

  return (
    <article className={live ? "event-card event-card-live" : "event-card"}>
      <div className="event-card-top">
        <span className={live ? "dday dday-live" : "dday"}>
          {live && <span className="live-pip" aria-hidden />}
          {dayLabel}
        </span>
        <span className="hype-score hype-score-small">
          <small>HYPE</small> {event.hype}
        </span>
      </div>

      <div className="event-meta">
        <span className={`sport-dot ${style.dot}`} aria-hidden />
        {eventCategory} · {event.series ?? event.league}
        {event.preview ? <span className="preview-label">미리보기</span> : null}
      </div>

      {matchup ? (
        <div className="compact-matchup">
          <div>
            <TeamMark team={matchup[0]} />
            <strong>{matchup[0].name}</strong>
          </div>
          <span>VS</span>
          <div>
            <TeamMark team={matchup[1]} />
            <strong>{matchup[1].name}</strong>
          </div>
        </div>
      ) : (
        <h3 className="event-title">{event.title}</h3>
      )}

      <div className="event-card-copy">
        <p className="event-time">
          {formatDateKo(event.dateKey).replace(/ \(.\)$/, "")} · {event.timeTbd ? "시간 미정" : formatTimeKo(event.startsAt)}
        </p>
        <p className="event-reason">{event.hypeReason || event.round || "기억해 둘 만한 다음 경기."}</p>
        <p className="verification-line">
          <span>{verificationLabel(event)}</span> {event.source}
        </p>
      </div>

      <EventActions
        event={event}
        saved={saved}
        onToggleSaved={onToggleSaved}
        onShare={onShare}
        shared={shared}
      />
    </article>
  );
}
