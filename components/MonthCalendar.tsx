"use client";

import type { SportEvent, Sport } from "@/lib/types";
import { diffDays, addDays, weekdayKo } from "@/lib/kst";
import { SPORT_STYLE } from "@/lib/sport-style";

/**
 * 한 달을 한눈에 보는 격자.
 * 칸마다 그날 열리는 종목을 색 점으로, "필수시청"이 있으면 테두리를 살려 표시한다.
 * 누르면 아래 목록의 해당 날짜로 스크롤한다.
 */

interface DayCell {
  key: string;
  sports: Sport[];
  hasMust: boolean;
  count: number;
}

function buildCells(events: SportEvent[], from: string, to: string): DayCell[] {
  const map = new Map<string, { sports: Set<Sport>; hasMust: boolean; count: number }>();
  for (const e of events) {
    let cell = map.get(e.dateKey);
    if (!cell) {
      cell = { sports: new Set(), hasMust: false, count: 0 };
      map.set(e.dateKey, cell);
    }
    cell.sports.add(e.sport);
    cell.count++;
    if (e.hype >= 70) cell.hasMust = true;
  }

  const cells: DayCell[] = [];
  const span = diffDays(from, to);
  for (let i = 0; i <= span; i++) {
    const key = addDays(from, i);
    const c = map.get(key);
    cells.push({
      key,
      sports: c ? [...c.sports] : [],
      hasMust: c?.hasMust ?? false,
      count: c?.count ?? 0,
    });
  }
  return cells;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

export function MonthCalendar({
  events,
  from,
  to,
  today,
  selected,
  onSelect,
}: {
  events: SportEvent[];
  from: string;
  to: string;
  today: string;
  selected: string | null;
  onSelect: (dateKey: string) => void;
}) {
  const cells = buildCells(events, from, to);

  // 첫 주의 빈 칸 — 달력이 요일에 맞게 떨어지도록 앞을 비운다
  const lead = WEEKDAYS.indexOf(weekdayKo(from));

  return (
    <div>
      <div className="mb-1.5 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w, i) => (
          <div
            key={w}
            className={`text-center text-[11px] font-bold ${
              i === 0 ? "text-live/80" : i === 6 ? "text-sport-volleyball/80" : "text-ink-400"
            }`}
          >
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: lead }, (_, i) => (
          <div key={`lead-${i}`} />
        ))}

        {cells.map((cell) => {
          const isToday = cell.key === today;
          const isSelected = cell.key === selected;
          const day = Number(cell.key.slice(8, 10));
          const isFirst = day === 1;

          return (
            <button
              key={cell.key}
              type="button"
              onClick={() => onSelect(cell.key)}
              disabled={cell.count === 0}
              aria-current={isToday ? "date" : undefined}
              className={`flex h-12 flex-col items-center justify-center gap-1 rounded-lg border text-[13px] transition-colors sm:h-14 ${
                isSelected
                  ? "border-accent bg-accent/15"
                  : cell.hasMust
                    ? "border-accent/40 bg-ink-800"
                    : "border-ink-700 bg-ink-850"
              } ${cell.count === 0 ? "opacity-30" : "hover:border-ink-400"}`}
            >
              <span
                className={`tnum leading-none ${
                  isToday
                    ? "rounded bg-accent px-1 py-0.5 font-black text-ink-900"
                    : isFirst
                      ? "font-bold text-ink-200"
                      : "font-semibold text-ink-200"
                }`}
              >
                {isFirst ? `${Number(cell.key.slice(5, 7))}/${day}` : day}
              </span>

              <span className="flex h-1.5 items-center gap-[3px]">
                {cell.sports.slice(0, 4).map((s) => (
                  <span
                    key={s}
                    className={`size-1.5 rounded-full ${SPORT_STYLE[s].dot}`}
                    aria-hidden
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
