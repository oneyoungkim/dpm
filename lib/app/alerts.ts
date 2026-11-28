/**
 * 앱 알림 계획표. 휴대폰 안에서만 예약하는 알림(로컬 알림)이라 서버나 계정이 필요 없다.
 *
 * 세 가지를 만든다.
 *   1. 저장한 일정: 시작 N분 전 (시각 미정이면 그날 아침 9시)
 *   2. 관심 종목 요약: 고른 시각에, 그날 관심 종목 일정이 있을 때만
 *   3. 메인 이벤트: 첫 화면 메인 이벤트가 시작하기 1시간 전
 *
 * 앱을 열 때, 다시 돌아올 때, 저장·관심·설정이 바뀔 때마다 통째로 다시 계산해 갈아 끼운다.
 * 순수 함수라 브라우저 없이 시험할 수 있다(scripts/app/alerts-selftest.ts).
 */
import type { InterestCategory, SportEvent } from "../types";
import { INTEREST_CATEGORIES } from "../types";
import { addDays, formatTimeKo } from "../kst";
import { interestCategoryOf } from "../interests";
import { broadcastOf } from "../broadcast";
import { mainEventOf } from "../main-event";

export const SAVED_LEADS = [0, 10, 30, 60] as const;
export type SavedLead = (typeof SAVED_LEADS)[number];

export const BRIEFING_TIMES = ["", "08:00", "09:00", "12:00", "18:00"] as const;
export type BriefingTime = (typeof BRIEFING_TIMES)[number];

export interface AlertSettings {
  /** 저장한 일정 시작 몇 분 전에 알릴지. 0이면 끔 */
  savedLead: SavedLead;
  /** 관심 종목 요약 시각(한국 시간). 빈 문자열이면 끔 */
  briefing: BriefingTime;
  /** 메인 이벤트 시작 1시간 전 알림 */
  mainEvent: boolean;
  /** 처음 여는 사람에게 알림 안내를 이미 보였는지 */
  onboarded: boolean;
}

export const DEFAULT_ALERT_SETTINGS: AlertSettings = {
  savedLead: 30,
  briefing: "09:00",
  mainEvent: true,
  onboarded: false,
};

/** 저장된 값이 깨졌거나 옛 모양이어도 쓸 수 있는 설정으로 맞춘다. */
export function normalizeAlertSettings(raw: unknown): AlertSettings {
  const value = (raw && typeof raw === "object" ? raw : {}) as Partial<AlertSettings>;
  return {
    savedLead: (SAVED_LEADS as readonly number[]).includes(value.savedLead as number)
      ? (value.savedLead as SavedLead)
      : DEFAULT_ALERT_SETTINGS.savedLead,
    briefing: (BRIEFING_TIMES as readonly string[]).includes(value.briefing as string)
      ? (value.briefing as BriefingTime)
      : DEFAULT_ALERT_SETTINGS.briefing,
    mainEvent: typeof value.mainEvent === "boolean" ? value.mainEvent : DEFAULT_ALERT_SETTINGS.mainEvent,
    onboarded: value.onboarded === true,
  };
}

export function leadLabel(minutes: number): string {
  return minutes >= 60 ? `${minutes / 60}시간` : `${minutes}분`;
}

export interface PlannedAlert {
  /** 같은 알림이면 늘 같은 열쇠 → 같은 번호 */
  key: string;
  id: number;
  kind: "saved" | "briefing" | "main";
  at: Date;
  title: string;
  body: string;
  /** 알림을 눌렀을 때 열 사이트 안 주소 */
  url: string;
}

/** iOS는 한 앱이 예약해 둘 수 있는 알림이 64개다. 여유를 두고 60개까지만. */
export const MAX_PENDING = 60;
/** 이만큼 앞의 일까지만 예약한다(그 뒤는 앱을 다시 열 때 채운다). */
export const PLAN_DAYS = 14;
const BRIEFING_DAYS = 7;
const MAIN_EVENT_LEAD_MIN = 60;
const UNTIMED_HOUR = "09:00";

/** 문자열 → 1 ~ 2^31-1 사이 번호(FNV-1a). 안드로이드 알림 번호가 int라서. */
export function alertId(key: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 0x7fffffff || 1;
}

function isOpen(event: SportEvent): boolean {
  return event.status !== "취소" && event.status !== "종료";
}

/** 그 시각에 맞춰 볼 수 있는 일정인지(출시 기간·날짜만 잡힌 것 제외) */
export function isTimed(event: SportEvent): boolean {
  return (
    (event.eventMode ?? "scheduled") === "scheduled" &&
    !event.timeTbd &&
    event.datePrecision !== "date" &&
    event.datePrecision !== "month"
  );
}

/** 한국 시간 날짜 + "HH:MM" → Date */
export function kstAt(dateKey: string, hhmm: string): Date {
  return new Date(`${dateKey}T${hhmm}:00+09:00`);
}

export function eventPath(eventId: string, view?: "saved" | "mine"): string {
  const query = view ? `?view=${view}` : "";
  return `/schedule${query}#ev-${encodeURIComponent(eventId)}`;
}

function broadcastText(event: SportEvent): string {
  const line = broadcastOf(event);
  if (!line) return "";
  return ` · 중계 ${line.outlets.map((outlet) => outlet.name).join(", ")}`;
}

function make(kind: PlannedAlert["kind"], key: string, at: Date, title: string, body: string, url: string): PlannedAlert {
  return { key, id: alertId(key), kind, at, title, body, url };
}

export interface PlanInput {
  events: SportEvent[];
  saved: Iterable<string>;
  interests: Iterable<string>;
  settings: AlertSettings;
  now: Date;
  /** 한국 시간 오늘(YYYY-MM-DD) */
  today: string;
}

export function planAlerts({ events, saved, interests, settings, now, today }: PlanInput): PlannedAlert[] {
  const savedIds = new Set(saved);
  const wanted = new Set(
    [...interests].filter((value): value is InterestCategory => (INTEREST_CATEGORIES as readonly string[]).includes(value)),
  );
  const open = events.filter(isOpen);
  const lastDay = addDays(today, PLAN_DAYS);
  const plans: PlannedAlert[] = [];

  // 1. 저장한 일정
  if (settings.savedLead > 0) {
    for (const event of open) {
      if (!savedIds.has(event.id) || event.dateKey < today || event.dateKey > lastDay) continue;
      if (isTimed(event)) {
        const at = new Date(Date.parse(event.startsAt) - settings.savedLead * 60_000);
        plans.push(
          make(
            "saved",
            `saved:${event.id}:${event.startsAt}:${settings.savedLead}`,
            at,
            event.title,
            `${leadLabel(settings.savedLead)} 뒤 시작 · ${event.league}${broadcastText(event)}`,
            eventPath(event.id, "saved"),
          ),
        );
      } else {
        plans.push(
          make(
            "saved",
            `saved-day:${event.id}:${event.dateKey}`,
            kstAt(event.dateKey, UNTIMED_HOUR),
            `오늘 · ${event.title}`,
            `${event.series ?? event.league} · 저장해 둔 일정이에요`,
            eventPath(event.id, "saved"),
          ),
        );
      }
    }
  }

  // 2. 메인 이벤트 (저장한 일정과 겹치면 저장 쪽 알림만)
  if (settings.mainEvent) {
    const seen = new Set<string>();
    for (let offset = 0; offset < BRIEFING_DAYS; offset += 1) {
      const main = mainEventOf(open, addDays(today, offset));
      if (!main || seen.has(main.id)) continue;
      seen.add(main.id);
      if (!isTimed(main) || main.dateKey > lastDay) continue;
      if (savedIds.has(main.id) && settings.savedLead > 0) continue;
      const at = new Date(Date.parse(main.startsAt) - MAIN_EVENT_LEAD_MIN * 60_000);
      plans.push(
        make(
          "main",
          `main:${main.id}:${main.startsAt}`,
          at,
          `메인 이벤트 · ${main.title}`,
          `1시간 뒤 시작 · ${main.league}${broadcastText(main)}`,
          eventPath(main.id),
        ),
      );
    }
  }

  // 3. 관심 종목 요약
  if (settings.briefing && wanted.size > 0) {
    for (let offset = 0; offset < BRIEFING_DAYS; offset += 1) {
      const day = addDays(today, offset);
      const at = kstAt(day, settings.briefing);
      // 요약 시각 전에 이미 시작한 경기는 빼고, 그날 남은 것만 모은다.
      const todays = open
        .filter((event) => event.dateKey === day && wanted.has(interestCategoryOf(event)))
        .filter((event) => !isTimed(event) || Date.parse(event.startsAt) >= at.getTime())
        .sort((a, b) => b.hype - a.hype || a.startsAt.localeCompare(b.startsAt));
      if (todays.length === 0) continue;
      const top = todays
        .slice(0, 3)
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
        .map((event) => (isTimed(event) ? `${formatTimeKo(event.startsAt)} ${event.title}` : event.title));
      const more = todays.length > 3 ? ` 외 ${todays.length - 3}개` : "";
      plans.push(
        make(
          "briefing",
          `briefing:${day}:${settings.briefing}`,
          at,
          `오늘 볼 각 ${todays.length}개`,
          `${top.join(" · ")}${more}`,
          "/schedule?view=mine",
        ),
      );
    }
  }

  const soon = now.getTime() + 60_000;
  const byKey = new Map<number, PlannedAlert>();
  for (const plan of plans) {
    if (plan.at.getTime() <= soon) continue;
    if (!byKey.has(plan.id)) byKey.set(plan.id, plan);
  }
  return [...byKey.values()].sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, MAX_PENDING);
}
