/** 이 사이트는 전부 한국 시간 기준이다. 서버가 UTC로 돌든 말든 KST로 고정한다. */

export const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

/** Date를 KST 벽시계로 옮긴 Date. getFullYear() 등을 KST 값으로 읽기 위한 용도. */
export function toKst(d: Date): Date {
  return new Date(d.getTime() + KST_OFFSET_MS);
}

/** KST 기준 YYYY-MM-DD */
export function dateKey(d: Date): string {
  return toKst(d).toISOString().slice(0, 10);
}

/** 지금(KST) 날짜 키 */
export function todayKey(): string {
  return dateKey(new Date());
}

/** YYYY-MM-DD 에 days를 더한 YYYY-MM-DD */
export function addDays(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** 두 날짜 키 사이의 일수 (to - from) */
export function diffDays(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86400000);
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

/** KST 요일 한 글자 */
export function weekdayKo(key: string): string {
  return WEEKDAYS[new Date(`${key}T00:00:00Z`).getUTCDay()];
}

/** "8월 15일 (토)" */
export function formatDateKo(key: string): string {
  const [, m, d] = key.split("-");
  return `${Number(m)}월 ${Number(d)}일 (${weekdayKo(key)})`;
}

/** ISO 시각 → KST "19:00" */
export function formatTimeKo(iso: string): string {
  const k = toKst(new Date(iso));
  const hh = String(k.getUTCHours()).padStart(2, "0");
  const mm = String(k.getUTCMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** KST 기준 시(0~23). 골든타임 가산점 계산에 쓴다. */
export function kstHour(iso: string): number {
  return toKst(new Date(iso)).getUTCHours();
}

/** 오늘/내일/모레는 이름으로 부른다. 그 외는 null. */
export function relativeLabel(key: string, today = todayKey()): string | null {
  const d = diffDays(today, key);
  if (d === 0) return "오늘";
  if (d === 1) return "내일";
  if (d === 2) return "모레";
  return null;
}
