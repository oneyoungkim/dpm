"use client";

/**
 * 앱 안에서 알림 예약을 맞추는 곳.
 * 일정은 /api/events 에서 받고, 계획(lib/app/alerts.ts)대로 휴대폰 알림을 통째로 갈아 끼운다.
 */
import type { SportEvent } from "../types";
import { todayKey, addDays } from "../kst";
import { DEFAULT_INTERESTS } from "../interests";
import { native } from "./native";
import {
  ALERT_SETTINGS_KEY,
  INTEREST_STORAGE_KEY,
  LEGACY_ALARM_KEY,
  SAVED_STORAGE_KEY,
  notifyPrefsChanged,
  readJson,
} from "./prefs";
import { PLAN_DAYS, normalizeAlertSettings, planAlerts, type AlertSettings, type PlannedAlert } from "./alerts";

export const ANDROID_CHANNEL_ID = "gak-alerts";
/** 안드로이드 알림 줄에 뜨는 작은 아이콘(앱의 res/drawable/ic_stat_gak) */
const SMALL_ICON = "ic_stat_gak";
const ICON_COLOR = "#FF2438";

export function loadAlertSettings(): AlertSettings {
  return normalizeAlertSettings(readJson<unknown>(ALERT_SETTINGS_KEY, null));
}

export function saveAlertSettings(next: AlertSettings): void {
  try {
    localStorage.setItem(ALERT_SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // 저장이 막혀도 이번 실행에서는 그대로 쓴다.
  }
  notifyPrefsChanged({ reason: "alerts" });
}

export function loadSavedIds(): string[] {
  const current = readJson<string[] | null>(SAVED_STORAGE_KEY, null);
  return current ?? readJson<string[]>(LEGACY_ALARM_KEY, []);
}

export function loadInterests(): string[] {
  const list = readJson<string[] | null>(INTEREST_STORAGE_KEY, null);
  return list && list.length > 0 ? list : [...DEFAULT_INTERESTS];
}

let cache: { at: number; events: SportEvent[] } | null = null;
const CACHE_MS = 10 * 60_000;

async function fetchEvents(): Promise<SportEvent[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.events;
  const today = todayKey();
  const response = await fetch(`/api/events?from=${today}&to=${addDays(today, PLAN_DAYS)}&limit=500`, {
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`일정 ${response.status}`);
  const data = (await response.json()) as { events: SportEvent[] };
  cache = { at: Date.now(), events: data.events };
  return data.events;
}

export type PermissionView = "granted" | "denied" | "prompt" | "unavailable";

export async function alertPermission(): Promise<PermissionView> {
  const n = await native();
  if (!n) return "unavailable";
  try {
    const { display } = await n.LocalNotifications.checkPermissions();
    return display === "granted" ? "granted" : display === "denied" ? "denied" : "prompt";
  } catch {
    return "unavailable";
  }
}

/** 휴대폰의 알림 허락 창을 띄운다. 이미 정했으면 창 없이 지금 상태만 돌려준다. */
export async function requestAlertPermission(): Promise<PermissionView> {
  const n = await native();
  if (!n) return "unavailable";
  try {
    const { display } = await n.LocalNotifications.requestPermissions();
    return display === "granted" ? "granted" : display === "denied" ? "denied" : "prompt";
  } catch {
    return "unavailable";
  }
}

let channelReady = false;
let running: Promise<PlannedAlert[]> | null = null;

/**
 * 계획을 다시 세워 예약을 갈아 끼운다. 알림 허락이 없으면 아무것도 하지 않는다.
 * 겹쳐 불려도 한 번만 돈다.
 */
export function syncAlerts(): Promise<PlannedAlert[]> {
  running ??= (async () => {
    const n = await native();
    if (!n) return [];
    const { display } = await n.LocalNotifications.checkPermissions();
    if (display !== "granted") return [];

    if (!channelReady && /Android/i.test(navigator.userAgent)) {
      await n.LocalNotifications.createChannel({
        id: ANDROID_CHANNEL_ID,
        name: "경기·일정 알림",
        description: "저장한 일정, 관심 종목 요약, 메인 이벤트",
        importance: 4,
      }).catch(() => undefined);
      channelReady = true;
    }

    const events = await fetchEvents();
    const plan = planAlerts({
      events,
      saved: loadSavedIds(),
      interests: loadInterests(),
      settings: loadAlertSettings(),
      now: new Date(),
      today: todayKey(),
    });

    const pending = await n.LocalNotifications.getPending();
    const keep = new Set(plan.map((item) => item.id));
    // 시험 알림은 5초 뒤 저절로 뜨고 사라지니 건드리지 않는다.
    const ours = pending.notifications.filter((item) => item.extra?.kind !== "test");
    const stale = ours.filter((item) => !keep.has(item.id));
    // 같은 번호는 내용(시각·문구)이 바뀌었을 수 있어 다시 건다.
    const replace = ours.filter((item) => keep.has(item.id));
    const cancel = [...stale, ...replace].map((item) => ({ id: item.id }));
    if (cancel.length > 0) await n.LocalNotifications.cancel({ notifications: cancel });

    if (plan.length > 0) {
      await n.LocalNotifications.schedule({
        notifications: plan.map((item) => ({
          id: item.id,
          title: item.title,
          body: item.body,
          schedule: { at: item.at, allowWhileIdle: true },
          extra: { gak: true, url: item.url, kind: item.kind },
          isExactNotification: false,
          channelId: ANDROID_CHANNEL_ID,
          smallIcon: SMALL_ICON,
          iconColor: ICON_COLOR,
        })),
      });
    }
    return plan;
  })().finally(() => {
    running = null;
  });
  return running;
}

/** 알림이 실제로 오는지 바로 확인하는 시험 알림(5초 뒤). 앱 심사 때도 이것으로 보여 준다. */
export async function sendTestAlert(): Promise<boolean> {
  const n = await native();
  if (!n) return false;
  const permission = await requestAlertPermission();
  if (permission !== "granted") return false;
  await n.LocalNotifications.schedule({
    notifications: [
      {
        id: 7,
        title: "각지지 알림이 켜져 있어요",
        body: "저장한 경기는 시작 전에, 관심 종목은 고른 시각에 알려 드려요.",
        schedule: { at: new Date(Date.now() + 5_000), allowWhileIdle: true },
        extra: { gak: true, url: "/alerts", kind: "test" },
        isExactNotification: false,
        channelId: ANDROID_CHANNEL_ID,
        smallIcon: SMALL_ICON,
        iconColor: ICON_COLOR,
      },
    ],
  });
  return true;
}

export interface PendingView {
  id: number;
  title: string;
  body: string;
  at: Date | null;
}

export async function pendingAlerts(): Promise<PendingView[]> {
  const n = await native();
  if (!n) return [];
  const { notifications } = await n.LocalNotifications.getPending();
  return notifications
    .filter((item) => item.extra?.gak === true)
    .map((item) => ({
      id: item.id,
      title: item.title ?? "",
      body: item.body ?? "",
      at: item.schedule?.at ? new Date(item.schedule.at) : null,
    }))
    .sort((a, b) => (a.at?.getTime() ?? 0) - (b.at?.getTime() ?? 0));
}
