import { readFileSync } from "node:fs";
import { join } from "node:path";
import { dateKey } from "../../lib/kst";
import type { InterestCategory, Sport, SportEvent } from "../../lib/types";
import {
  candidatesFileSchema,
  dedupeCandidates,
  hasWeakVerification,
  type EventCandidate,
} from "../discovery/candidate-schema";

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

/** 영어 브랜드·플랫폼 이름 → 국내 표기. 제목을 새로 만들 때만 쓴다. */
const BRAND_KO: Array<[RegExp, string]> = [
  [/\bPlayStation Plus\b/gi, "플레이스테이션 플러스"],
  [/\bPlayStation\b/gi, "플레이스테이션"],
  [/\bXbox Game Pass\b/gi, "엑스박스 게임 패스"],
  [/\bXbox\b/gi, "엑스박스"],
  [/\bApple Arcade\b/gi, "애플 아케이드"],
  [/\bApple TV\b/gi, "애플 TV"],
  [/\bApple\b/gi, "애플"],
  [/\bSamsung\b/gi, "삼성"],
  [/\bGalaxy\b/gi, "갤럭시"],
  [/\bNintendo\b/gi, "닌텐도"],
  [/\bIntelligent Eyewear\b/gi, "지능형 아이웨어"],
];

/**
 * 영어 제목에서 "무슨 일인지"를 뽑아 한국어 꼬리말로 쓴다. 위에서부터 먼저 맞는 것 하나.
 * en은 영어 원문에서 찾을 패턴(제목 안에 있으면 그 자리를 한국어로 바꾼다), ko는 한국어 근거 문장에서 찾을 패턴.
 */
const ACTION_KO: Array<{ en: RegExp; ko: RegExp; label: string }> = [
  { en: /closed beta/i, ko: /클로즈드 ?베타/, label: "클로즈드 베타" },
  { en: /open beta/i, ko: /오픈 ?베타/, label: "오픈 베타" },
  { en: /\bbeta\b/i, ko: /베타/, label: "베타 테스트" },
  { en: /\bDLC\b|\bexpansion\b/i, ko: /DLC|확장팩/, label: "DLC 출시" },
  { en: /\bupdate\b/i, ko: /업데이트/, label: "업데이트" },
  { en: /\bunpacked\b/i, ko: /언팩/, label: "언팩" },
  { en: /\bshowcase\b|state of play|\bdirect\b/i, ko: /쇼케이스/, label: "쇼케이스" },
  { en: /\bholiday lineup\b|\blineup\b/i, ko: /라인업/, label: "라인업 공개" },
  { en: /pre-?order/i, ko: /사전 ?예약/, label: "사전 예약" },
  { en: /\blaunch(?:es)?\b|\brelease\b|\barrives\b|\bcoming\b/i, ko: /출시|발매/, label: "출시" },
];

function hasHangul(value: string): boolean {
  return /[가-힣]/.test(value);
}

/** 모델이 제목 끝에 붙인 날짜 꼬리표 "(12/19)", "— 2027년 1월 31일"은 카드에 날짜가 따로 있어 뺀다. */
function stripDateNoise(title: string): string {
  return title
    .replace(/\s*\((?:\d{1,2}\/\d{1,2}|\d{1,2}월\s*\d{1,2}일)(?:\s*일정)?\)\s*/g, " ")
    .replace(/\s*[—–-]\s*\d{4}년\s*\d{1,2}월\s*\d{1,2}일\s*$/, "")
    .replace(/\s*\d{4}년\s*\d{1,2}월\s*\d{1,2}일\s*$/, "")
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function koreanize(value: string): string {
  let out = value;
  for (const [re, ko] of BRAND_KO) out = out.replace(re, ko);
  return out.trim();
}

/**
 * 카드 제목. 우선순위: 발견 단계가 준 titleKo → 이미 한국어인 제목 → 제품 이름 + 한국어 꼬리말.
 * 108건을 손으로 번역하지 않고도 "PlayStation Plus Monthly Games for …" 같은 영어 보도자료 제목이
 * 메인에 그대로 뜨지 않게 하는 임시 장치다. 다음 발견부터는 titleKo가 채워진다.
 */
export function displayTitle(candidate: EventCandidate): string {
  if (candidate.titleKo?.trim()) return stripDateNoise(candidate.titleKo);
  const title = stripDateNoise(candidate.title);
  if (hasHangul(title)) return title;

  // 격투기·스포츠 대회명은 고유명사("ONE Fight Night 49", "Lapilus vs McKee")라 그대로 둔다
  if (SPORT_BY_CATEGORY[candidate.category]) return title;

  // 시리즈가 출처 이름(“Xbox Wire”, “PlayStation Blog”)이면 제목에서 동사 앞부분만 제품명으로 쓴다
  const seriesIsSource = /blog|wire|newsroom/i.test(candidate.series) || candidate.series === candidate.source;
  const productFromTitle = title.split(
    /\s+(?:will\s+launch|launches|launch|arrives|comes\s+to|coming\s+to|is\s+coming|available)\b/i,
  )[0];
  let subject = koreanize(stripDateNoise(seriesIsSource ? productFromTitle : candidate.series));

  const english = `${candidate.title} ${candidate.series}`;
  const action =
    ACTION_KO.find((a) => a.en.test(english)) ??
    ACTION_KO.find((a) => a.ko.test(candidate.reason ?? "")) ??
    (candidate.eventMode === "release-window" ? ACTION_KO[ACTION_KO.length - 1] : undefined);

  if (action) {
    // 제품명 안에 이미 영어로 들어 있으면("Dawnbreaker Closed Beta") 그 자리를 한국어로 바꾼다
    if (action.en.test(subject)) subject = subject.replace(action.en, action.label);
    else subject = `${subject} ${action.label}`;
  }
  subject = subject.replace(/\s+/g, " ").trim();
  return subject.length > 60 ? `${subject.slice(0, 58).trimEnd()}…` : subject;
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
    title: displayTitle(candidate),
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
    // 같은 발표 여러 건은 한 건으로 — 발견 단계에서도 합치지만 예전 파일이 남아 있을 수 있다
    return dedupeCandidates(parsed.data.events.filter((candidate) => !hasWeakVerification(candidate)))
      .map((candidate) => candidateToEvent(candidate, from, to))
      .filter((event): event is SportEvent => event !== null);
  } catch (error) {
    console.warn(`   ! candidates.json 을 못 읽었다: ${error instanceof Error ? error.message : error}`);
    return [];
  }
}
