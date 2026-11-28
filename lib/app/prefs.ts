/**
 * 기기에 남기는 사용자 선택(저장한 일정, 관심 종목, 앱 알림 설정)의 열쇠 이름과 알림.
 *
 * 웹에서는 브라우저 localStorage에만 둔다.
 * 앱에서는 같은 값을 휴대폰 저장소(Capacitor Preferences)에도 적어 둔다.
 * iOS 웹뷰는 오래 안 쓴 사이트의 localStorage를 지울 수 있어서, 앱을 다시 열 때 휴대폰 저장소에서 되살린다.
 */

export const SAVED_STORAGE_KEY = "matchday.saved.v1";
export const LEGACY_ALARM_KEY = "matchday.alarms.v1";
export const INTEREST_STORAGE_KEY = "matchday.interests.v1";
export const ALERT_SETTINGS_KEY = "gak.alerts.v1";

/** 앱이 휴대폰 저장소와 맞춰 두는 열쇠 */
export const MIRRORED_KEYS = [SAVED_STORAGE_KEY, INTEREST_STORAGE_KEY, ALERT_SETTINGS_KEY] as const;

/** 저장·관심이 바뀌었을 때 (앱은 이것을 듣고 휴대폰 저장소와 알림 예약을 고친다) */
export const PREFS_CHANGED_EVENT = "gak:prefs-changed";
/** 앱이 휴대폰 저장소에서 값을 되살렸을 때 (화면은 이것을 듣고 다시 읽는다) */
export const PREFS_RESTORED_EVENT = "gak:prefs-restored";

export type PrefsChangeReason = "saved-add" | "saved-remove" | "interests" | "alerts";

export interface PrefsChangeDetail {
  reason: PrefsChangeReason;
  /** saved-add / saved-remove 일 때 일정 id */
  eventId?: string;
}

export function notifyPrefsChanged(detail: PrefsChangeDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<PrefsChangeDetail>(PREFS_CHANGED_EVENT, { detail }));
}

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}
