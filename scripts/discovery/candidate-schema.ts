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
  return /구체적.{0,12}날짜.{0,20}(?:없|명시되지|확인되지)|날짜.{0,20}(?:없|명시되지|확정되지)|specific date.{0,20}(?:not|missing)|date.{0,20}not specified/i.test(
    reason,
  );
}
