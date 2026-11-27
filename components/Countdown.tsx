"use client";

import { useEffect, useRef, useState } from "react";
import { diffDays, todayKey } from "@/lib/kst";

/** D-day 이름표. MainEventHero의 서버 쪽 규칙과 같다. */
function ddayLabelOf(dateKey: string, live: boolean, today: string): string {
  if (live) return "LIVE";
  const days = diffDays(today, dateKey);
  return days <= 0 ? "오늘" : `D-${days}`;
}

/** "2일 1시간 남음". 분 단위까지만 센다(초는 돌리지 않는다). */
function remainingText(startsAt: string, dateKey: string, timeTbd: boolean, now: number): string {
  if (timeTbd) {
    const days = diffDays(todayKey(), dateKey);
    return days > 0 ? `${days}일 남음 · 시간 미정` : "오늘 · 시간 미정";
  }
  const ms = Date.parse(startsAt) - now;
  if (!Number.isFinite(ms)) return "";
  if (ms <= 0) return "시작 시각이 지났습니다";
  const minutes = Math.floor(ms / 60000);
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  if (d > 0) return `${d}일 ${h}시간 남음`;
  if (h > 0) return `${h}시간 ${m}분 남음`;
  return m > 0 ? `${m}분 남음` : "곧 시작";
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/**
 * 메인 이벤트 카드의 큰 D-day 숫자와 남은 시간.
 * 서버는 D-day(initialLabel)만 그리고, 남은 시간은 마운트 뒤에 채운다(hydration 값 차이를 막으려고).
 * 1분마다 다시 센다. D-day가 바뀌면 숫자만 위로 밀려 올라가며 바뀐다.
 */
export function Countdown({
  startsAt,
  dateKey,
  timeTbd = false,
  live = false,
  initialLabel,
}: {
  startsAt: string;
  dateKey: string;
  timeTbd?: boolean;
  live?: boolean;
  initialLabel: string;
}) {
  const [label, setLabel] = useState(initialLabel);
  const [previous, setPrevious] = useState<string | null>(null);
  const [left, setLeft] = useState<string | null>(live ? "지금 진행 중" : null);
  const labelRef = useRef(initialLabel);

  useEffect(() => {
    if (live) return;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const now = Date.now();
      const next = ddayLabelOf(dateKey, false, todayKey());
      if (next !== labelRef.current) {
        if (!prefersReducedMotion()) setPrevious(labelRef.current);
        labelRef.current = next;
        setLabel(next);
      }
      setLeft(remainingText(startsAt, dateKey, timeTbd, now));
      // 다음 분이 바뀌는 순간에 맞춰 다시 센다.
      timer = setTimeout(tick, 60000 - (now % 60000) + 50);
    };
    tick();
    return () => clearTimeout(timer);
  }, [startsAt, dateKey, timeTbd, live]);

  return (
    <div className={live ? "cd cd-live" : "cd"}>
      <span className="cd-dday">
        {live ? <span className="live-dot cd-dot" aria-hidden /> : null}
        <span className="cd-roll">
          {previous ? (
            <span className="cd-out" aria-hidden onAnimationEnd={() => setPrevious(null)}>
              {previous}
            </span>
          ) : null}
          <span key={label} className={previous ? "cd-in" : undefined}>
            {label}
          </span>
        </span>
      </span>
      {/* 자리를 미리 잡아 두고 채운다. 채울 때 아래 내용이 밀리지 않는다. */}
      <span className="cd-left">{left ?? " "}</span>
    </div>
  );
}
