"use client";

/**
 * 휴대폰 앱(각지지 앱, Capacitor) 안에서만 쓰는 네이티브 기능 창구.
 *
 * 앱은 gak.gg를 그대로 띄우고, 사용자 에이전트 끝에 "GakApp/<버전>"을 붙인다.
 * 웹 브라우저에서는 이 파일의 함수가 아무것도 하지 않거나 false를 돌려준다.
 * @capacitor/core는 앱 안에서만 불러온다(웹 방문자 묶음에 들어가지 않게).
 */

export const APP_UA_MARK = "GakApp/";

/** 앱 안인지. 첫 화면 그리기 전에도 쓸 수 있게 사용자 에이전트로 본다. */
export function isApp(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.userAgent.includes(APP_UA_MARK);
}

export function appPlatform(): "ios" | "android" | "web" {
  if (!isApp()) return "web";
  return /Android/i.test(navigator.userAgent) ? "android" : "ios";
}

type PermissionState = "prompt" | "prompt-with-rationale" | "granted" | "denied";

export interface LocalNotificationSchema {
  id: number;
  title: string;
  body: string;
  schedule?: { at: Date; allowWhileIdle?: boolean };
  extra?: Record<string, unknown>;
  /** 안드로이드: 정확한 알람 권한을 묻지 않고 조금 늦을 수 있는 알람으로 건다. */
  isExactNotification?: boolean;
  channelId?: string;
  smallIcon?: string;
  iconColor?: string;
  group?: string;
}

interface ListenerHandle {
  remove: () => Promise<void>;
}

export interface LocalNotificationsPlugin {
  checkPermissions(): Promise<{ display: PermissionState }>;
  requestPermissions(): Promise<{ display: PermissionState }>;
  schedule(options: { notifications: LocalNotificationSchema[] }): Promise<unknown>;
  getPending(): Promise<{ notifications: Array<{ id: number; title?: string; body?: string; schedule?: { at?: string | Date }; extra?: Record<string, unknown> }> }>;
  cancel(options: { notifications: Array<{ id: number }> }): Promise<void>;
  createChannel(channel: { id: string; name: string; description?: string; importance?: 1 | 2 | 3 | 4 | 5 }): Promise<void>;
  addListener(
    event: "localNotificationActionPerformed",
    fn: (action: { actionId: string; notification: { id: number; extra?: Record<string, unknown> } }) => void,
  ): Promise<ListenerHandle>;
}

interface PreferencesPlugin {
  get(options: { key: string }): Promise<{ value: string | null }>;
  set(options: { key: string; value: string }): Promise<void>;
}

interface SharePlugin {
  share(options: { title?: string; text?: string; url?: string; dialogTitle?: string }): Promise<unknown>;
}

interface HapticsPlugin {
  impact(options: { style: "LIGHT" | "MEDIUM" | "HEAVY" }): Promise<void>;
  selectionChanged?(): Promise<void>;
}

interface AppPlugin {
  getInfo(): Promise<{ name: string; id: string; build: string; version: string }>;
  addListener(event: "resume", fn: () => void): Promise<ListenerHandle>;
  openUrl?(options: { url: string }): Promise<{ completed: boolean }>;
}

interface BrowserPlugin {
  open(options: { url: string; toolbarColor?: string; presentationStyle?: "fullscreen" | "popover" }): Promise<void>;
}

export interface NativePlugins {
  LocalNotifications: LocalNotificationsPlugin;
  Preferences: PreferencesPlugin;
  Share: SharePlugin;
  Haptics: HapticsPlugin;
  App: AppPlugin;
  Browser: BrowserPlugin;
}

let loading: Promise<NativePlugins | null> | null = null;

/** 앱 안이면 네이티브 기능 묶음, 아니면 null. 한 번만 불러온다. */
export function native(): Promise<NativePlugins | null> {
  if (!isApp()) return Promise.resolve(null);
  loading ??= import("@capacitor/core")
    .then(({ Capacitor, registerPlugin }) => {
      if (!Capacitor.isNativePlatform()) return null;
      return {
        LocalNotifications: registerPlugin<LocalNotificationsPlugin>("LocalNotifications"),
        Preferences: registerPlugin<PreferencesPlugin>("Preferences"),
        Share: registerPlugin<SharePlugin>("Share"),
        Haptics: registerPlugin<HapticsPlugin>("Haptics"),
        App: registerPlugin<AppPlugin>("App"),
        Browser: registerPlugin<BrowserPlugin>("Browser"),
      };
    })
    .catch(() => null);
  return loading;
}

/** 가볍게 톡. 실패해도 조용히 넘어간다. */
export function tap(style: "LIGHT" | "MEDIUM" = "LIGHT"): void {
  void native().then((n) => n?.Haptics.impact({ style }).catch(() => undefined));
}

/**
 * 공유. 앱에서는 휴대폰 공유 시트를, 웹에서는 브라우저 공유(없으면 복사)를 쓴다.
 * 공유 시트를 닫은 경우도 성공으로 친다.
 */
export async function shareLink(input: { title: string; text: string; url: string }): Promise<"shared" | "copied" | "failed"> {
  const n = await native();
  if (n) {
    try {
      await n.Share.share({ title: input.title, text: input.text, url: input.url, dialogTitle: "공유하기" });
      return "shared";
    } catch {
      return "failed";
    }
  }
  try {
    if (navigator.share) {
      await navigator.share(input);
      return "shared";
    }
    await navigator.clipboard.writeText(`${input.text}\n${input.url}`);
    return "copied";
  } catch {
    return "failed";
  }
}
