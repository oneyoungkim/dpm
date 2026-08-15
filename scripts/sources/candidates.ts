import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dateKey } from "../../lib/kst";
import type { InterestCategory, Sport, SportEvent } from "../../lib/types";
import { candidatesFileSchema, hasWeakVerification, type EventCandidate } from "../discovery/candidate-schema";

const SPORT_BY_CATEGORY: Partial<Record<InterestCategory, Sport>> = {
  축구: "축구",
  야구: "야구",
  격투기: "격투기",
  e스포츠: "e스포츠",
  농구: "농구",
};

function leagueKeyOf(candidate: EventCandidate): string {
  if (candidate.category !== "격투기") return `candidate-${candidate.category}`;
  const text = `${candidate.source} ${candidate.series} ${candidate.title}`.toLowerCase();
  if (/black\s*combat|블랙컴뱃/.test(text)) return "blackcombat";
  if (/road\s*fc/.test(text)) return "roadfc";
  if (/one championship|\bone\b/.test(text)) return "one";
  if (/\bpfl\b/.test(text)) return "pfl";
  if (/\bufc\b/.test(text)) {
    return /fight night|파이트 나이트|ufc\s+[^\d]/i.test(candidate.title)
      ? "ufc_fight_night"
      : "ufc_numbered";
  }
  return "candidate-격투기";
}

export function candidateToEvent(candidate: EventCandidate, from: string, to: string): SportEvent | null {
  if (!candidate.id || !candidate.title || !candidate.series || !candidate.sourceUrl) return null;
  if (candidate.confidence === "rumored") return null;
  const timestamp = Date.parse(candidate.startsAt);
  if (Number.isNaN(timestamp)) return null;
  const key = dateKey(new Date(timestamp));
  if (key < from || key > to) return null;

  return {
    id: `candidate:${candidate.id}`,
    sport: SPORT_BY_CATEGORY[candidate.category] ?? "기타",
    category: candidate.category,
    tags: candidate.tags,
    series: candidate.series,
    league: candidate.series,
    leagueKey: leagueKeyOf(candidate),
    title: candidate.title,
    startsAt: candidate.startsAt,
    timeTbd: candidate.timeTbd,
    dateKey: key,
    status: "예정",
    round: candidate.round,
    eventMode: candidate.eventMode ?? "scheduled",
    datePrecision: candidate.datePrecision ?? (candidate.timeTbd ? "date" : "time"),
    confidence: candidate.confidence,
    hype: 0,
    hypeReason: candidate.reason,
    source: candidate.source,
    sourceUrl: candidate.sourceUrl,
  };
}

export function loadCandidates(from: string, to: string): SportEvent[] {
  const path = join(process.cwd(), "data", "candidates.json");
  try {
    const parsed = candidatesFileSchema.safeParse(JSON.parse(readFileSync(path, "utf-8")));
    if (!parsed.success) {
      console.warn(`   ! candidates.json 형식 오류: ${parsed.error.message}`);
      return [];
    }
    return parsed.data.events
      .filter((candidate) => !hasWeakVerification(candidate))
      .map((candidate) => candidateToEvent(candidate, from, to))
      .filter((event): event is SportEvent => event !== null);
  } catch (error) {
    console.warn(`   ! candidates.json 을 못 읽었다: ${error instanceof Error ? error.message : error}`);
    return [];
  }
}
