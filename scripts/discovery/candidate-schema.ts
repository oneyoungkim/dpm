import { z } from "zod";
import { INTEREST_CATEGORIES } from "../../lib/types";

export const eventCandidateSchema = z.object({
  id: z.string().min(6),
  title: z.string().min(2).max(180),
  /** 카드에 그대로 쓰는 한국어 제목. 예전 후보에는 없어서 선택값이다(candidates.ts가 대신 만든다). */
  titleKo: z.string().min(2).max(80).optional(),
  category: z.enum(INTEREST_CATEGORIES),
  tags: z.array(z.string().min(1).max(60)).max(12),
  series: z.string().min(1).max(100),
  startsAt: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "invalid startsAt"),
  timeTbd: z.boolean().optional(),
  eventMode: z.enum(["scheduled", "release-window", "live-trigger"]).optional(),
  datePrecision: z.enum(["time", "date", "month"]).optional(),
  confidence: z.enum(["confirmed", "expected", "rumored"]),
  source: z.string().min(1).max(100),
  sourceUrl: z.string().url().refine((value) => value.startsWith("https://"), "HTTPS required"),
  reason: z.string().min(1).max(180).optional(),
  round: z.string().min(1).max(100).optional(),
});

export const candidatesFileSchema = z.object({
  generatedAt: z.string().nullable(),
  events: z.array(eventCandidateSchema),
});

export type EventCandidate = z.infer<typeof eventCandidateSchema>;
export type CandidatesFile = z.infer<typeof candidatesFileSchema>;

/** 모델의 설명이 스스로 "날짜 근거 없음"이라고 말하면 구조가 유효해도 게시하지 않는다. */
export function hasMissingDateEvidence(reason?: string): boolean {
  if (!reason) return false;
  return /구체적.{0,12}날짜.{0,20}(?:없|명시되지|확인되지)|날짜.{0,20}(?:없|명시되지|확정되지)|확정.{0,12}어렵|추가.{0,12}확인.{0,12}필요|구체.{0,4}일자.{0,12}(?:없|미기재|명시되지)|일자는?\s*미기재|월\s*기준으로|연도\s*일정으로|월만\s*(?:표기|명시)|specific date.{0,20}(?:not|missing)|date.{0,20}not specified|cannot confirm/i.test(
    reason,
  );
}

/**
 * 날짜는 있지만 "그날 볼 것"이 없는 후보. 일정 사이트에 올릴 이벤트가 아니다.
 *   - "11월 30일까지 받을 수 있다"처럼 마감·종료일만 있는 안내 (PS Plus 월간 게임 등)
 *   - 콜라보·스킨·포즈·번들 판매 같은 상품 공지
 *   - "(참고) … 별도 확인 필요"처럼 모델이 스스로 후보가 아니라고 적은 것
 */
export function isNonEventCandidate(
  event: Pick<EventCandidate, "title" | "series" | "reason"> & { titleKo?: string },
): boolean {
  const text = `${event.title} ${event.titleKo ?? ""} ${event.series}`;
  const reason = event.reason ?? "";
  const all = `${text} ${reason}`;
  if (/까지\s*(?:이용|받을|제공|판매|무료|다운로드|구매|할인|플레이할)|까지\s*(?:만\s*)?(?:이용\s*)?가능/.test(all)) return true;
  // "5일부터 7일까지 진행"은 기간 행사라 살리고, 시작 없이 끝만 있는 "30일까지 진행"만 거른다
  if (/까지\s*진행/.test(all) && !/부터|시작/.test(all)) return true;
  if (/\b(?:available|free|playable|claim)\b.{0,40}\buntil\b|\buntil\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(all)) return true;
  if (/monthly games|월간\s*게임|game catalog|게임 카탈로그/i.test(text)) return true;
  if (/\bunlock\b|\bskins?\b|\bbundle\b|\bcosmetic|\bpose\b|스킨|콜라보|컬래버|코스튬|번들|굿즈/i.test(text)) return true;
  if (/\s+x\s+[A-Z]/.test(event.title) && !/\bvs\.?\b/i.test(event.title)) return true; // "Gears of War x Liquid Death"
  if (/^\s*\(?참고\)?|별도\s*확인\s*필요/.test(text)) return true;
  return false;
}

export function hasWeakVerification(
  event: Pick<
    EventCandidate,
    "title" | "startsAt" | "timeTbd" | "datePrecision" | "sourceUrl" | "reason"
  > & { series?: string; titleKo?: string },
): boolean {
  if (hasMissingDateEvidence(event.reason)) return true;
  if (isNonEventCandidate({ ...event, series: event.series ?? "" })) return true;
  // 모든 AI 경로는 날짜만 확정이어도 KST 정오 오프셋까지 쓰도록 약속했다.
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(event.startsAt)) {
    return true;
  }
  if (event.datePrecision === "date" && event.timeTbd === false) return true;

  // 한 카드 제목에 서로 다른 날짜가 두 번 나오면 여러 이벤트를 뭉친 결과다.
  const dates = event.title.match(/(?:\d{1,2}[/.월-]\s*\d{1,2}(?:일)?)/g) ?? [];
  if (dates.length > 1) return true;

  try {
    const path = new URL(event.sourceUrl).pathname.replace(/\/$/, "").toLowerCase();
    // 여러 해의 과거·미래 항목이 섞인 목록 페이지는 연도를 잘못 붙일 위험이 크다.
    if (["/events", "/event", "/schedule"].includes(path)) return true;
  } catch {
    return true;
  }
  return false;
}

/** 제목·시리즈 비교용. 영문·숫자·한글만 남긴다. */
function looseKey(value: string): string {
  return value
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]/g, "");
}

function hasHangul(value?: string): boolean {
  return Boolean(value && /[가-힣]/.test(value));
}

/** 같은 발표를 여러 번 뽑은 것 가운데 남길 쪽 점수. 한국어 제목·확정·시각까지 있는 쪽이 이긴다. */
function keepScore(e: EventCandidate): number {
  return (
    (e.titleKo ? 4 : 0) +
    (hasHangul(e.title) ? 2 : 0) +
    (e.confidence === "confirmed" ? 1 : 0) +
    (e.timeTbd ? 0 : 1) +
    // 시리즈 자리에 출처 이름("Xbox Wire")이 들어간 건 제품명을 잃은 추출이라 뒤로 민다
    (/blog|wire|newsroom/i.test(e.series) ? 0 : 1)
  );
}

/**
 * 같은 발표가 두세 번 올라오는 걸 한 건으로 합친다.
 *   1) 같은 원문 주소(sourceUrl) + 같은 날짜(KST 날짜는 startsAt 앞 10자로 충분) → 같은 행사
 *   2) 출처가 달라도 같은 날짜·같은 분류에 시리즈 이름이 서로를 포함하면 같은 행사
 *      (Xbox Wire와 PlayStation Blog가 같은 DLC를 각각 알린 경우)
 * 입력 순서가 뒤인 것(더 최근 발견)이 점수가 같으면 이긴다.
 */
export function dedupeCandidates(events: EventCandidate[]): EventCandidate[] {
  const kept: EventCandidate[] = [];
  const same = (a: EventCandidate, b: EventCandidate) => {
    if (a.startsAt.slice(0, 10) !== b.startsAt.slice(0, 10)) return false;
    if (a.sourceUrl === b.sourceUrl) return true;
    if (a.category !== b.category) return false;
    const sa = looseKey(a.series);
    const sb = looseKey(b.series);
    if (sa.length < 4 || sb.length < 4) return false;
    return sa === sb || sa.includes(sb) || sb.includes(sa);
  };
  for (const event of events) {
    const i = kept.findIndex((k) => same(k, event));
    if (i < 0) kept.push(event);
    else if (keepScore(event) >= keepScore(kept[i])) kept[i] = event;
  }
  return kept;
}
