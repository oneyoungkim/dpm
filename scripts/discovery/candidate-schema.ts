import { z } from "zod";
import { INTEREST_CATEGORIES } from "../../lib/types";

export const eventCandidateSchema = z.object({
  id: z.string().min(6),
  title: z.string().min(2).max(180),
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
  return /구체적.{0,12}날짜.{0,20}(?:없|명시되지|확인되지)|날짜.{0,20}(?:없|명시되지|확정되지)|확정.{0,12}어렵|추가.{0,12}확인.{0,12}필요|specific date.{0,20}(?:not|missing)|date.{0,20}not specified|cannot confirm/i.test(
    reason,
  );
}

export function hasWeakVerification(
  event: Pick<EventCandidate, "title" | "startsAt" | "timeTbd" | "datePrecision" | "sourceUrl" | "reason">,
): boolean {
  if (hasMissingDateEvidence(event.reason)) return true;
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
