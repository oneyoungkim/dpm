import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { EventsFile, SportEvent, Sport } from "./types";
import { SPORTS } from "./types";
import { todayKey } from "./kst";
import { activeInterestCategories as findActiveInterests, interestCategoryOf } from "./interests";
import type { InterestCategory } from "./types";

/**
 * 사이트가 데이터를 읽는 유일한 통로.
 * 지금은 크롤러가 만든 data/events.json 을 읽지만, 나중에 DB로 갈아탈 때
 * 바꿀 곳은 이 파일 하나면 된다.
 */

const EMPTY: EventsFile = {
  generatedAt: new Date(0).toISOString(),
  range: { from: todayKey(), to: todayKey() },
  events: [],
  stats: {},
};

export function loadEvents(): EventsFile {
  try {
    const raw = readFileSync(join(process.cwd(), "data", "events.json"), "utf-8");
    const parsed = JSON.parse(raw) as EventsFile;
    return {
      ...parsed,
      events: parsed.events.map((event) => ({
        ...event,
        category: interestCategoryOf(event),
        tags:
          event.tags ??
          [event.sport, event.league, event.home?.name, event.away?.name].filter(
            (tag): tag is string => Boolean(tag),
          ),
        eventMode: event.eventMode ?? "scheduled",
        datePrecision: event.datePrecision ?? (event.timeTbd ? "date" : "time"),
        confidence: event.confidence ?? "confirmed",
      })),
    };
  } catch {
    // 크롤을 한 번도 안 돌린 상태에서도 사이트는 떠야 한다
    return EMPTY;
  }
}

export function activeInterests(events: SportEvent[]): InterestCategory[] {
  return findActiveInterests(events);
}

export interface DayGroup {
  dateKey: string;
  events: SportEvent[];
}

/** 날짜별로 묶는다. 크롤러가 이미 날짜→하이프 순으로 정렬해 둔 순서를 유지한다. */
export function groupByDate(events: SportEvent[]): DayGroup[] {
  const map = new Map<string, SportEvent[]>();
  for (const e of events) {
    const list = map.get(e.dateKey);
    if (list) list.push(e);
    else map.set(e.dateKey, [e]);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([dateKey, list]) => ({ dateKey, events: list }));
}

/** 실제로 경기가 있는 종목만, SPORTS 순서대로. 빈 칩을 보여줄 이유가 없다. */
export function activeSports(events: SportEvent[]): Sport[] {
  const present = new Set(events.map((e) => e.sport));
  return SPORTS.filter((s) => present.has(s));
}

/** 상단 배너용 — 오늘 경기 중 가장 볼 만한 것들. */
export function todaysPicks(events: SportEvent[], limit = 3): SportEvent[] {
  const today = todayKey();
  return events
    .filter((e) => e.dateKey === today && e.status !== "취소")
    .sort((a, b) => b.hype - a.hype)
    .slice(0, limit);
}

/** 오늘 경기가 없거나 시시할 때 대신 보여줄 "이번 달 빅 이벤트". */
export function monthHighlights(events: SportEvent[], limit = 6): SportEvent[] {
  const today = todayKey();
  return events
    .filter((e) => e.dateKey >= today && e.status !== "취소")
    .sort((a, b) => b.hype - a.hype || a.startsAt.localeCompare(b.startsAt))
    .slice(0, limit);
}
