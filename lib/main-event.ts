import type { SportEvent } from "./types";
import { addDays } from "./kst";

/**
 * "메인 이벤트"를 정하는 단 하나의 기준.
 * 첫 화면 맨 위 카드와 매거진의 메인 이벤트 소개 글이 같은 기준을 쓴다.
 */

/** 첫 화면과 아침 편이 보는 기간(오늘 포함 며칠 뒤까지) */
export const MAIN_EVENT_DAYS = 7;
/** 그 기간에 소개할 것이 남지 않았을 때 넓혀 보는 기간 */
export const MAIN_EVENT_WIDE_DAYS = 30;
/** 메인 이벤트로 치는 하이프 문턱 */
export const MAIN_EVENT_MIN_HYPE = 70;
/** 문턱을 넘는 일정이 하나도 없는 주에 내려 잡는 문턱 */
export const MAIN_EVENT_FLOOR_HYPE = 55;

function isOpen(event: Pick<SportEvent, "status">): boolean {
  return event.status !== "취소" && event.status !== "종료";
}

/** 시각이 잡힌 경기·발표가 아닌 일정(출시 기간, 날짜만 정해진 안내)에서 깎는 점수 */
export const NOT_TIMED_PENALTY = 12;

/**
 * 메인 이벤트를 가릴 때 쓰는 점수.
 * "그 시각에 볼 것"이 있는 일정을 앞세운다. 출시 묶음 안내 같은 항목은 하이프가 조금 높아도 뒤로 간다.
 * 대작 출시처럼 하이프가 훨씬 높은 것은 깎여도 앞에 선다.
 */
export function mainEventScore(event: SportEvent): number {
  const timed = (event.eventMode ?? "scheduled") === "scheduled" && !event.timeTbd && event.datePrecision !== "date" && event.datePrecision !== "month";
  return event.hype - (timed ? 0 : NOT_TIMED_PENALTY);
}

function byHype(a: SportEvent, b: SportEvent): number {
  return mainEventScore(b) - mainEventScore(a) || b.hype - a.hype || a.startsAt.localeCompare(b.startsAt);
}

/** today(YYYY-MM-DD, 한국 날짜)부터 days일 뒤까지 열리는 일정을 하이프 높은 순으로. */
export function rankMainEvents(events: SportEvent[], today: string, days = MAIN_EVENT_DAYS): SportEvent[] {
  const last = addDays(today, days);
  return events.filter((event) => event.dateKey >= today && event.dateKey <= last && isOpen(event)).sort(byHype);
}

/** 첫 화면 맨 위에 올릴 일정 하나. 7일 안에 없으면 30일 안에서 고른다. */
export function mainEventOf(events: SportEvent[], today: string): SportEvent | undefined {
  return rankMainEvents(events, today, MAIN_EVENT_DAYS)[0] ?? rankMainEvents(events, today, MAIN_EVENT_WIDE_DAYS)[0];
}

export type MainEventTier = "이번 주" | "30일 안" | "이번 주(문턱 낮춤)";

export interface MainEventPick {
  event: SportEvent;
  tier: MainEventTier;
}

/**
 * 매거진이 소개할 차례인 메인 이벤트를 순서대로.
 * 이미 소개 글이 있는 일정(coveredIds)은 뺀다.
 *   1. 7일 안, 하이프 70 이상
 *   2. 30일 안, 하이프 70 이상 (큰 일정은 일찍부터 이야기를 쌓는다)
 *   3. 7일 안, 하이프 55 이상
 */
export function mainEventsToCover(
  events: SportEvent[],
  today: string,
  coveredIds: ReadonlySet<string>,
): MainEventPick[] {
  const fresh = (list: SportEvent[]) => list.filter((event) => !coveredIds.has(event.id));
  const week = fresh(rankMainEvents(events, today, MAIN_EVENT_DAYS));
  const month = fresh(rankMainEvents(events, today, MAIN_EVENT_WIDE_DAYS));
  const picks: MainEventPick[] = [];
  const seen = new Set<string>();
  const push = (list: SportEvent[], tier: MainEventTier) => {
    for (const event of list) {
      if (seen.has(event.id)) continue;
      seen.add(event.id);
      picks.push({ event, tier });
    }
  };
  push(week.filter((event) => event.hype >= MAIN_EVENT_MIN_HYPE), "이번 주");
  push(month.filter((event) => event.hype >= MAIN_EVENT_MIN_HYPE), "30일 안");
  push(week.filter((event) => event.hype >= MAIN_EVENT_FLOOR_HYPE), "이번 주(문턱 낮춤)");
  return picks;
}
