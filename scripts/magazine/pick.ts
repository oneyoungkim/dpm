import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ARTICLE_CATEGORIES, loadAllArticles, type Article, type ArticleCategory } from "../../lib/articles";
import { loadEvents } from "../../lib/events";
import { mainEventsToCover, type MainEventTier } from "../../lib/main-event";
import { diffDays } from "../../lib/kst";
import { TREND_CATEGORIES, type FmSearchItem, type TrendCategory, type TrendKeyword, type TrendsFile } from "../../lib/trends";
import { INTEREST_CATEGORIES, SPORTS, type InterestCategory, type SportEvent } from "../../lib/types";
import { TOPIC_RULES } from "./rules";
import { normalizeTag, titleSimilarity } from "./check";

/**
 * 다음 글감 후보를 점수순으로 낸다.
 *
 *   npm run magazine:pick -- --slot morning          아침 편: 메인 이벤트 소개 글
 *   npm run magazine:pick -- --slot evening          저녁 편: 키워드("왜 난리인가")·상시 글
 *   npm run magazine:pick -- --slot evening --json   기계가 읽는 결과
 *   --limit 10                                       몇 개까지 낼지(기본 10)
 *
 * 하루 한 편은 반드시 메인 이벤트 소개 글이다(EDITORIAL 2장).
 *   아침 편: lib/main-event.ts 의 mainEventsToCover 첫 일정을 맨 위 후보(required: true)로,
 *            그다음 차례 일정 2개를 대체 후보로 낸다. 키워드·상시 글감은 그 아래에
 *            "일정을 셋 다 못 쓸 때만" 표시(role: "fallback")를 달고 둔다.
 *   저녁 편: 일정 후보를 내지 않는다. 단, 오늘 날짜 글 가운데 eventIds 가 있는 글이 하나도 없으면
 *            아침 편과 같은 출력으로 메인 이벤트 소개를 대신 맡는다.
 *   이미 소개한 일정 = 지금까지 낸 모든 글의 eventIds(기간 제한 없음).
 *
 * 재료
 *   data/trends.json   민감하지 않고 커뮤니티 2곳 이상에서 나온 키워드, 또는 에펨코리아 검색어 순위에 오른 키워드.
 *                      검색어 순위에 오른 키워드를 먼저 낸다(이유에 "에펨 검색어 N위(+M)"). 집계가 TREND_MAX_AGE_H
 *                      보다 오래됐으면 키워드 글감을 내지 않는다(며칠 지난 화제를 "왜 난리인가"로 쓰지 않게).
 *   data/events.json   메인 이벤트 차례(lib/main-event.ts 기준)
 *   scripts/magazine/evergreen.json   언제 써도 되는 글감
 * 빼는 것: 최근 14일 글의 태그·키워드와 겹치는 글감, 이미 쓴 글과 제목이 겹치는 상시 글감,
 *          EDITORIAL 3장 금지어가 든 글감. 직전 두 편과 같은 분류는 점수를 깎는다
 *          (메인 이벤트 후보에는 분류 감점을 걸지 않는다).
 * 파일이 없거나 비어 있으면 그 재료만 건너뛴다.
 */

export type Slot = "morning" | "evening";
type Kind = "trend" | "event" | "evergreen";
/** main-event: 이번 회차에 써야 하는 일정, alternate: 그 일정을 못 쓸 때 차례로, fallback: 일정을 셋 다 못 쓸 때만, normal: 보통 후보 */
type Role = "main-event" | "alternate" | "fallback" | "normal";

export interface Candidate {
  kind: Kind;
  id: string;
  category: ArticleCategory;
  /** EDITORIAL 2장 형식 */
  format: string;
  title: string;
  score: number;
  reason: string;
  tags: string[];
  /** 머리말 keywords/eventIds 에 그대로 넣을 값 */
  keywords: string[];
  eventIds: string[];
  sourceHints: string[];
  /** 점수 계산 설명(사람이 읽는 조각들) */
  notes: string[];
  /** 이번 회차에 반드시 써야 하는 후보(메인 이벤트 첫 일정)만 true */
  required: boolean;
  role: Role;
  /** 키워드 글감이 에펨코리아 검색어 순위에 올랐으면 그 검색어(순위·변화·검색어 표기) */
  fmSearch?: FmSearchItem;
}

interface Evergreen {
  id: string;
  category: string;
  format: string;
  title: string;
  angle: string;
  tags: string[];
  sourceHints: string[];
}

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const RECENT_DAYS = 14;
const TREND_MIN_SOURCES = 2;
/**
 * 키워드 순위(와 그 안의 에펨코리아 검색어 순위)가 이보다 오래됐으면 키워드 글감을 내지 않는다.
 * 집계는 2시간마다라 반나절이 지났으면 수집이 멈춘 것이고, 거기 있는 화제는 이미 지난 이야기일 수 있다.
 */
export const TREND_MAX_AGE_H = 12;
/**
 * 에펨코리아 검색어 순위에 오른 키워드 글감의 가산점(11-27부터 "왜 난리인가" 글감의 1순위 근거).
 *   기본 50 + 순위(1위 30, 한 칸 내려갈 때마다 3씩 덜, 10위 3) + 변화(new +8, 오른 칸마다 +2, 내린 칸마다 -2, 3칸까지)
 * 기본 50: 검색어 없는 키워드 글감은 많아야 30 + 점수 반(키워드 점수에서 검색어가 1위를 차지해 대개 33 이하) + 15 + 3 이라,
 * 검색어 10위도 그보다 위에 오게 했다. 상시 글감(50~65)도 넘는다.
 * 분류 연속 감점(직전 두 편과 같은 분류 ×0.7·×0.2)은 그대로 걸린다. 같은 분류 세 편 연속 금지가 먼저다.
 */
const PICK_SEARCH_BASE = 50;
const PICK_SEARCH_PER_RANK = 3;
const PICK_SEARCH_NEW = 8;
const PICK_SEARCH_PER_MOVE = 2;
const PICK_SEARCH_MOVE_MAX = 3;
/** 메인 이벤트 첫 일정 뒤에 붙이는 대체 후보 수 */
const MAIN_EVENT_ALTERNATES = 2;

/**
 * 키워드·상시 글감 무게. 일정 후보는 점수와 상관없이 맨 위에 놓이므로 무게를 두지 않는다.
 * 메인 이벤트를 맡은 회차는 아침 무게를 쓴다.
 */
const SLOT_WEIGHT: Record<Slot, Record<Exclude<Kind, "event">, number>> = {
  morning: { trend: 1.25, evergreen: 0.8 },
  evening: { trend: 1.15, evergreen: 1.0 },
};

/** 직전 한 편과 같은 분류, 직전 두 편과 모두 같은 분류(세 편 연속은 EDITORIAL 2장이 막는다) */
const SAME_AS_LAST = 0.7;
const SAME_AS_LAST_TWO = 0.2;
/** 결과 목록 안에서 같은 분류가 반복될 때마다 */
const REPEAT_IN_LIST = 0.85;

/** 겹침 비교에서 빼는 너무 넓은 태그 */
const GENERIC_TAGS = new Set(
  [
    ...ARTICLE_CATEGORIES,
    ...TREND_CATEGORIES,
    ...INTEREST_CATEGORIES,
    ...SPORTS,
    "UFC",
    "MMA",
    "출시",
    "게임 출시",
    "DLC",
    "업데이트",
    "프리미어리그",
    "KBO",
    "NBA",
    "MLB",
    "LCK",
  ].map(normalizeTag),
);

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function hasBannedTopic(text: string): string | null {
  for (const rule of TOPIC_RULES) {
    if (rule.mode !== "first-hit") continue;
    for (const pattern of rule.patterns) {
      const m = text.match(pattern.re);
      if (m) return `${rule.title}("${m[0]}")`;
    }
  }
  return null;
}

/** 날짜마다 조금씩 다른, 그러나 다시 돌리면 같은 값(0~1). 상시 글감이 매일 같은 순서로 나오지 않게 한다. */
function dailyJitter(seed: string): number {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

function kstDate(d: Date): string {
  return new Date(d.getTime() + 9 * 3_600_000).toISOString().slice(0, 10);
}

/** 일정 시각을 한국 시간 "YYYY-MM-DD HH:MM"으로(소스마다 Z·+09:00 표기가 섞여 있다) */
function kstStamp(iso: string): string {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? iso.slice(0, 16).replace("T", " ") : new Date(t + 9 * 3_600_000).toISOString().slice(0, 16).replace("T", " ");
}

// ─── 재료 읽기 ─────────────────────────────────────────

function readTrends(): { file: TrendsFile | null; note: string } {
  const path = join(process.cwd(), "data", "trends.json");
  if (!existsSync(path)) return { file: null, note: "data/trends.json 없음(아직 집계 전)" };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as TrendsFile;
    if (!Array.isArray(parsed.keywords)) return { file: null, note: "data/trends.json 형식이 다름(keywords 없음)" };
    const search = parsed.fmkoreaSearch?.items.length
      ? `, 에펨 검색어 ${parsed.fmkoreaSearch.items.length}개(${kstStamp(parsed.fmkoreaSearch.collectedAt)} 수집)`
      : ", 에펨 검색어 없음";
    return {
      file: parsed,
      note: `data/trends.json ${parsed.keywords.length}개(집계 ${parsed.generatedAt ? `${kstStamp(parsed.generatedAt)} KST` : "시각 없음"}${search})`,
    };
  } catch (error) {
    return { file: null, note: `data/trends.json 읽기 실패: ${error instanceof Error ? error.message : error}` };
  }
}

function readEvergreen(): { topics: Evergreen[]; note: string } {
  const path = join(process.cwd(), "scripts", "magazine", "evergreen.json");
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as { topics?: Evergreen[] };
    const topics = (parsed.topics ?? []).filter((t) => (ARTICLE_CATEGORIES as readonly string[]).includes(t.category));
    return { topics, note: `evergreen.json ${topics.length}개` };
  } catch (error) {
    return { topics: [], note: `evergreen.json 읽기 실패: ${error instanceof Error ? error.message : error}` };
  }
}

const TREND_TO_ARTICLE: Record<TrendCategory, ArticleCategory | null> = {
  축구: "축구",
  야구: "야구",
  격투기: "격투기",
  농구: "농구",
  게임: "게임",
  테크: "테크",
  자동차: "자동차",
  돈: "돈",
  연예: "컬처",
  // 시사는 정치·사건사고와 붙어 다녀서 자동 글감에서 뺀다(EDITORIAL 3장)
  시사: null,
  기타: "컬처",
};

const INTEREST_TO_ARTICLE: Partial<Record<InterestCategory, ArticleCategory>> = {
  축구: "축구",
  야구: "야구",
  격투기: "격투기",
  "e스포츠": "게임",
  농구: "농구",
  모터스포츠: "자동차",
  게임: "게임",
  테크: "테크",
  // "돈과 승부"는 베팅으로 읽힐 수 있어 매거진 글감으로 쓰지 않는다
};

// ─── 후보 만들기 ───────────────────────────────────────

/** "에펨 검색어 6위(+1)" 꼴. 키워드와 검색어 표기가 다르면 검색어도 적는다 */
export function fmSearchLabel(hit: FmSearchItem, keyword: string): string {
  const move = hit.change === "new" ? "new" : hit.change > 0 ? `+${hit.change}` : hit.change < 0 ? `${hit.change}` : "";
  const query = hit.keyword.toLowerCase().replace(/\s/g, "") === keyword.toLowerCase().replace(/\s/g, "") ? "" : `검색어 "${hit.keyword}"`;
  const inside = [move, query].filter(Boolean).join(", ");
  return `에펨 검색어 ${hit.rank}위${inside ? `(${inside})` : ""}`;
}

function fmSearchBonus(hit: FmSearchItem): number {
  const rank = Math.max(0, 11 - hit.rank) * PICK_SEARCH_PER_RANK;
  const move =
    hit.change === "new"
      ? PICK_SEARCH_NEW
      : Math.sign(hit.change) * Math.min(Math.abs(hit.change), PICK_SEARCH_MOVE_MAX) * PICK_SEARCH_PER_MOVE;
  return PICK_SEARCH_BASE + rank + move;
}

/** 집계 시각이 now 에서 몇 시간 전인가(읽을 수 없으면 무한대) */
function ageHours(iso: string | undefined, now: Date): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? Infinity : (now.getTime() - t) / HOUR_MS;
}

export function fromTrends(file: TrendsFile | null, skipped: string[], now = new Date()): Candidate[] {
  if (!file) return [];
  const age = ageHours(file.generatedAt, now);
  if (age > TREND_MAX_AGE_H) {
    skipped.push(`키워드 순위 전체: ${Number.isFinite(age) ? `${Math.round(age)}시간 전` : "시각을 모르는"} 집계라 쓰지 않음(기준 ${TREND_MAX_AGE_H}시간, 지난 화제일 수 있음)`);
    return [];
  }
  // 검색어 순위는 그 자체의 수집 시각으로 한 번 더 본다(보조 수집이면 집계보다 이를 수 있다)
  const searchFresh = Boolean(file.fmkoreaSearch) && ageHours(file.fmkoreaSearch?.collectedAt, now) <= TREND_MAX_AGE_H;
  const out: Candidate[] = [];
  for (const item of file.keywords as TrendKeyword[]) {
    if (item.sensitive) continue;
    const hit = searchFresh ? item.fmSearch : undefined;
    const sourceCount = item.sources?.length ?? 0;
    // 커뮤니티 한 곳에서만 나온 말도 에펨 검색어 순위에 올랐으면 쓴다(찾아본 사람이 많다는 별도 근거)
    if (sourceCount < TREND_MIN_SOURCES && !hit) continue;
    const category = TREND_TO_ARTICLE[item.category];
    if (!category) {
      skipped.push(`키워드 "${item.keyword}": 분류 ${item.category}는 자동 글감에서 뺌`);
      continue;
    }
    const banned = hasBannedTopic(`${item.keyword} ${hit?.keyword ?? ""}`);
    if (banned) {
      skipped.push(`키워드 "${item.keyword}": 금지 주제 ${banned}`);
      continue;
    }
    const movement = item.delta === null ? "새로 진입" : item.delta > 0 ? `${item.delta}계단 상승` : item.delta < 0 ? `${-item.delta}계단 하락` : "제자리";
    const posts =
      item.mentions > 0
        ? `커뮤니티 ${sourceCount}곳(${item.sources.join(", ")})에서 글 ${item.mentions}개`
        : "인기글 제목엔 아직 없음(검색어로만 뜸)";
    const notes: string[] = [];
    if (hit) notes.push("에펨코리아 검색어 순위에 올라 먼저 제시");
    if (hit && item.mentions === 0) notes.push("글 제목에 없는 검색어라 무엇 때문에 찾는지부터 확인");
    out.push({
      kind: "trend",
      id: `trend:${item.keyword}`,
      category,
      format: "왜 난리인가",
      title: `키워드 "${item.keyword}", 왜 순위에 올랐나`,
      score:
        30 +
        item.score * 0.5 +
        Math.min(Math.max(sourceCount - TREND_MIN_SOURCES, 0), 3) * 5 +
        Math.min(item.streak, 3) +
        (hit ? fmSearchBonus(hit) : 0),
      reason: `${hit ? `${fmSearchLabel(hit, item.keyword)}, ` : ""}키워드 순위 ${item.rank}위(점수 ${item.score}, ${movement}), ${posts}`,
      tags: [item.keyword],
      keywords: [item.keyword],
      eventIds: [],
      sourceHints: ["본인·소속 단체 공식 발표", "통신사(연합뉴스·로이터) 보도"],
      notes,
      required: false,
      role: "normal",
      ...(hit ? { fmSearch: hit } : {}),
    });
  }
  return out;
}

function eventCategory(event: SportEvent): ArticleCategory | null {
  if (event.category && INTEREST_TO_ARTICLE[event.category]) return INTEREST_TO_ARTICLE[event.category] ?? null;
  const bySport: Partial<Record<string, ArticleCategory>> = { 야구: "야구", 축구: "축구", 격투기: "격투기", 농구: "농구", "e스포츠": "게임" };
  return bySport[event.sport] ?? null;
}

/** 같은 발표가 여러 건으로 들어온 것을 하나로 보기 위한 열쇠 */
function announcementKey(event: Pick<SportEvent, "title">): string {
  return event.title.toLowerCase().replace(/[^a-z0-9가-힣]/g, "").slice(0, 28);
}

export interface MainEventSummary {
  eventId: string;
  title: string;
  startsAt: string;
  hype: number;
  tier: MainEventTier;
  category: ArticleCategory;
  reason: string;
}

export interface MainEventField {
  /** 이번 회차가 메인 이벤트 소개 글을 반드시 써야 하면 true */
  required: boolean;
  eventId: string | null;
  title: string | null;
  startsAt: string | null;
  hype: number | null;
  tier: MainEventTier | null;
  category: ArticleCategory | null;
  /** 고른 이유, 또는 required 가 false 인 이유 */
  reason: string;
  alternates: MainEventSummary[];
}

export interface MainEventPlan {
  /** 이번 회차가 메인 이벤트 소개를 맡는가(아침, 또는 저녁이 대신 맡을 때) */
  covers: boolean;
  /** 맨 위 후보 + 대체 후보(맡지 않으면 빈 배열) */
  candidates: Candidate[];
  mainEvent: MainEventField;
  note: string;
}

type ArticleLike = Pick<Article, "publishedAt" | "eventIds" | "file">;

/** 오늘(KST) 날짜로 낸 글 가운데 일정(eventIds)을 다룬 글 */
export function todaysEventArticles(articles: ArticleLike[], today: string): ArticleLike[] {
  return articles.filter((article) => article.publishedAt.slice(0, 10) === today && article.eventIds.length > 0);
}

/**
 * 이번 회차의 메인 이벤트 후보를 정한다.
 * articles 는 지금까지 낸 글 전부(초안 제외). 그 eventIds 가 곧 "이미 소개한 일정"이다.
 * 걸러진 일정(매거진 분류로 못 옮김, 금지 주제, 이미 소개한 일정과 같은 발표, 앞 후보와 같은 발표)은
 * skipped 에 적고 다음 차례로 넘어간다.
 */
export function planMainEvent(
  input: { events: SportEvent[]; articles: ArticleLike[]; now: Date; slot: Slot },
  skipped: string[],
): MainEventPlan {
  const { events, articles, now, slot } = input;
  const today = kstDate(now);
  const empty = (reason: string): MainEventField => ({
    required: false,
    eventId: null,
    title: null,
    startsAt: null,
    hype: null,
    tier: null,
    category: null,
    reason,
    alternates: [],
  });

  if (slot === "evening") {
    const done = todaysEventArticles(articles, today);
    if (done.length) {
      const files = done.map((a) => a.file).join(", ");
      return {
        covers: false,
        candidates: [],
        mainEvent: empty(`오늘 낸 일정 글이 있음(${files}). 저녁 편은 키워드·상시 글`),
        note: `오늘 일정 글 ${done.length}편(${files}), 저녁 편은 메인 이벤트를 맡지 않음`,
      };
    }
  }
  const takeover = slot === "evening";

  if (!events.length) {
    const reason = "data/events.json 없음 또는 0건";
    return { covers: true, candidates: [], mainEvent: empty(reason), note: reason };
  }

  const coveredIds = new Set(articles.flatMap((article) => article.eventIds));
  const coveredKeys = new Set(events.filter((event) => coveredIds.has(event.id)).map(announcementKey));
  const queue = mainEventsToCover(events, today, coveredIds);

  const chosen: { candidate: Candidate; tier: MainEventTier; event: SportEvent }[] = [];
  const chosenKeys = new Map<string, Candidate>();
  for (const { event, tier } of queue) {
    if (chosen.length > MAIN_EVENT_ALTERNATES) break;
    const category = eventCategory(event);
    if (!category) {
      skipped.push(`일정 "${event.title}": 매거진 분류로 옮길 수 없음(${event.category ?? event.sport})`);
      continue;
    }
    const banned = hasBannedTopic(`${event.title} ${(event.tags ?? []).join(" ")}`);
    if (banned) {
      skipped.push(`일정 "${event.title}": 금지 주제 ${banned}`);
      continue;
    }
    const key = announcementKey(event);
    if (coveredKeys.has(key)) {
      skipped.push(`일정 "${event.title}"(${event.id}): 이미 소개한 일정과 같은 발표`);
      continue;
    }
    const twin = chosenKeys.get(key);
    if (twin) {
      skipped.push(`일정 "${event.title}"(${event.id}): 같은 발표가 여러 건이라 앞 후보 하나로 합침`);
      if (!twin.notes.includes("같은 발표가 여러 건이라 하나로 합침")) twin.notes.push("같은 발표가 여러 건이라 하나로 합침");
      continue;
    }
    const starts = Date.parse(event.startsAt);
    const days = Number.isNaN(starts) ? 0 : Math.max(0, (starts - now.getTime()) / DAY_MS);
    const dDayN = diffDays(today, event.dateKey);
    const dDay = dDayN <= 0 ? "오늘" : `D-${dDayN}`;
    const confidence = event.confidence === "rumored" ? 0.7 : event.confidence === "expected" ? 0.9 : 1;
    const first = chosen.length === 0;
    const candidate: Candidate = {
      kind: "event",
      id: `event:${event.id}`,
      category,
      format: "프리뷰",
      title: `${event.title} 프리뷰`,
      // 순서는 mainEventsToCover 차례를 따른다. 점수는 참고로만 남긴다.
      score: Math.round((event.hype - days * 3) * confidence * 10) / 10,
      reason: `메인 이벤트 ${tier} · ${dDay}(${kstStamp(event.startsAt)} KST), 하이프 ${event.hype}${event.hypeReason ? `(${event.hypeReason})` : ""}, ${event.league}${event.confidence && event.confidence !== "confirmed" ? `, 확정도 ${event.confidence}` : ""}`,
      tags: (event.tags ?? []).slice(0, 6),
      keywords: [],
      eventIds: [event.id],
      sourceHints: [event.sourceUrl ?? event.link ?? "주최 측 공식 공지", "주최 측 공식 공지"].filter((v, i, a) => a.indexOf(v) === i),
      notes: [first ? "메인 이벤트: 이번 회차에 이 일정을 소개한다" : `대체 후보 ${chosen.length}: 앞 일정에서 근거 3개를 못 찾을 때`],
      required: first,
      role: first ? "main-event" : "alternate",
    };
    chosenKeys.set(key, candidate);
    chosen.push({ candidate, tier, event });
  }

  const tierCount = (tier: MainEventTier) => queue.filter((p) => p.tier === tier).length;
  const note =
    `data/events.json ${events.length}건, 이미 소개한 일정 ${coveredIds.size}개, 소개할 차례 ${queue.length}건` +
    `(이번 주 ${tierCount("이번 주")}, 30일 안 ${tierCount("30일 안")}, 이번 주(문턱 낮춤) ${tierCount("이번 주(문턱 낮춤)")})` +
    `, 후보로 낸 것 ${chosen.length}건${takeover ? ", 오늘 일정 글이 없어 저녁 편이 대신 맡음" : ""}`;

  if (!chosen.length) {
    const reason = queue.length
      ? `소개할 차례인 일정 ${queue.length}건이 모두 걸러짐(뺀 것 참고)`
      : "7일 안 하이프 55 이상, 30일 안 하이프 70 이상인 일정 가운데 아직 소개하지 않은 것이 없음";
    return { covers: true, candidates: [], mainEvent: empty(reason), note };
  }

  const summary = ({ candidate, tier, event }: (typeof chosen)[number]): MainEventSummary => ({
    eventId: event.id,
    title: event.title,
    startsAt: event.startsAt,
    hype: event.hype,
    tier,
    category: candidate.category,
    reason: candidate.reason,
  });
  const [head, ...rest] = chosen;
  return {
    covers: true,
    candidates: chosen.map((c) => c.candidate),
    mainEvent: {
      required: true,
      ...summary(head),
      reason: `${takeover ? "오늘 낸 글 가운데 일정 글이 없어 저녁 편이 메인 이벤트를 맡음. " : ""}${head.candidate.reason}`,
      alternates: rest.map(summary),
    },
    note,
  };
}

function fromEvergreen(topics: Evergreen[], today: string, slot: Slot, all: Article[], skipped: string[]): Candidate[] {
  const out: Candidate[] = [];
  for (const topic of topics) {
    const done = all.find(
      (article) =>
        titleSimilarity(article.title, topic.title) >= 0.5 ||
        article.keywords.includes(topic.id) ||
        article.tags.filter((tag) => topic.tags.some((t) => normalizeTag(t) === normalizeTag(tag) && !GENERIC_TAGS.has(normalizeTag(t)))).length >= 2,
    );
    if (done) {
      skipped.push(`상시 "${topic.title}": 이미 쓴 글과 겹침(${done.file})`);
      continue;
    }
    const banned = hasBannedTopic(`${topic.title} ${topic.angle} ${topic.tags.join(" ")}`);
    if (banned) {
      skipped.push(`상시 "${topic.title}": 금지 주제 ${banned}`);
      continue;
    }
    out.push({
      kind: "evergreen",
      id: `evergreen:${topic.id}`,
      category: topic.category as ArticleCategory,
      format: topic.format,
      title: topic.title,
      score: 50 + dailyJitter(`${topic.id}:${today}:${slot}`) * 15,
      reason: `상시 글감(${topic.format}): ${topic.angle}`,
      tags: topic.tags,
      // 다음에 같은 상시 글감을 다시 고르지 않도록 id를 keywords에 남긴다
      keywords: [topic.id],
      eventIds: [],
      sourceHints: topic.sourceHints,
      notes: [],
      required: false,
      role: "normal",
    });
  }
  return out;
}

// ─── 거르고 점수 매기기 ────────────────────────────────

function recentTerms(recent: Article[]): { terms: Set<string>; eventIds: Set<string> } {
  const terms = new Set<string>();
  const eventIds = new Set<string>();
  for (const article of recent) {
    for (const term of [...article.tags, ...article.keywords]) {
      const norm = normalizeTag(term);
      if (norm && !GENERIC_TAGS.has(norm)) terms.add(norm);
    }
    for (const id of article.eventIds) eventIds.add(id);
  }
  return { terms, eventIds };
}

function overlapsRecent(candidate: Candidate, recent: { terms: Set<string>; eventIds: Set<string> }): string | null {
  if (candidate.eventIds.some((id) => recent.eventIds.has(id))) return "최근 14일에 다룬 일정";
  const own = [...new Set([...candidate.tags, ...candidate.keywords].map(normalizeTag))].filter((t) => t && !GENERIC_TAGS.has(t));
  const shared = own.filter((t) => recent.terms.has(t));
  // 키워드 글감은 그 키워드 하나가 곧 주제다
  if (candidate.kind === "trend" && shared.length) return `최근 14일 태그·키워드와 겹침(${shared.join(", ")})`;
  if (shared.length >= 2) return `최근 14일 태그·키워드와 겹침(${shared.join(", ")})`;
  return null;
}

function main() {
  const slotArg = arg("slot");
  if (slotArg !== "morning" && slotArg !== "evening") {
    console.error("사용법: npm run magazine:pick -- --slot morning|evening [--json] [--limit 10]");
    process.exit(1);
  }
  const slot: Slot = slotArg;
  const json = process.argv.includes("--json");
  const limit = Math.max(1, Number(arg("limit") ?? 10) || 10);
  const now = new Date();
  const today = kstDate(now);

  // 초안(draft: true)은 아직 낸 글이 아니므로 최근 글·직전 두 편·이미 소개한 일정에서 뺀다
  const all = loadAllArticles().filter((a) => !a.draft);
  const recent = all.filter((a) => Math.abs(now.getTime() - Date.parse(a.publishedAt)) <= RECENT_DAYS * DAY_MS);
  const lastTwo = [...all].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 2);
  const recentSet = recentTerms(recent);

  const skipped: string[] = [];
  const trends = readTrends();
  const evergreen = readEvergreen();
  const plan = planMainEvent({ events: loadEvents().events, articles: all, now, slot }, skipped);
  // 메인 이벤트를 맡은 회차는 아침 무게, 아니면 그 회차 무게
  const weights = SLOT_WEIGHT[plan.covers ? "morning" : slot];
  const pool = [...fromTrends(trends.file, skipped, now), ...fromEvergreen(evergreen.topics, today, slot, all, skipped)];

  // 메인 이벤트 후보에는 최근 태그 겹침·분류 감점을 걸지 않는다(검사도 프리뷰 글은 이 둘을 오류로 보지 않는다).
  // 겹침은 글을 쓸 때 각도를 바꾸라는 참고로만 남긴다.
  for (const candidate of plan.candidates) {
    const overlap = overlapsRecent(candidate, recentSet);
    if (overlap) candidate.notes.push(`참고: ${overlap}. 같은 이야기를 되풀이하지 않게 각도를 바꾼다`);
  }

  const kept: Candidate[] = [];
  for (const candidate of pool) {
    const overlap = overlapsRecent(candidate, recentSet);
    if (overlap) {
      skipped.push(`${candidate.title}: ${overlap}`);
      continue;
    }
    candidate.score *= weights[candidate.kind as Exclude<Kind, "event">];
    if (lastTwo.length === 2 && lastTwo.every((a) => a.category === candidate.category)) {
      candidate.score *= SAME_AS_LAST_TWO;
      candidate.notes.push(`직전 두 편이 모두 ${candidate.category}라 크게 깎음(세 편 연속 금지)`);
    } else if (lastTwo[0]?.category === candidate.category || lastTwo[1]?.category === candidate.category) {
      candidate.score *= SAME_AS_LAST;
      candidate.notes.push(`직전 두 편 가운데 ${candidate.category}가 있어 깎음`);
    }
    if (plan.mainEvent.required) {
      candidate.role = "fallback";
      candidate.notes.push("일정을 셋 다 못 쓸 때만");
    }
    kept.push(candidate);
  }

  // 같은 분류가 줄줄이 나오지 않게, 위에서부터 고르며 반복 분류를 깎는다(메인 이벤트 후보는 빼고 센다)
  const ranked: Candidate[] = [...plan.candidates];
  const remaining = [...kept];
  const used = new Map<string, number>();
  const totalLimit = Math.max(limit, plan.candidates.length);
  while (remaining.length && ranked.length < totalLimit) {
    remaining.sort(
      (a, b) =>
        b.score * REPEAT_IN_LIST ** (used.get(b.category) ?? 0) - a.score * REPEAT_IN_LIST ** (used.get(a.category) ?? 0),
    );
    const next = remaining.shift()!;
    const repeats = used.get(next.category) ?? 0;
    if (repeats) {
      next.score *= REPEAT_IN_LIST ** repeats;
      next.notes.push(`목록 안 ${next.category} ${repeats + 1}번째라 조금 깎음`);
    }
    used.set(next.category, repeats + 1);
    next.score = Math.round(next.score * 10) / 10;
    ranked.push(next);
  }

  const inputs = {
    trends: trends.note,
    events: plan.note,
    evergreen: evergreen.note,
    recentArticles: `최근 ${RECENT_DAYS}일 글 ${recent.length}편, 직전 두 편 분류: ${lastTwo.map((a) => a.category).join(", ") || "없음"}`,
  };
  const { mainEvent } = plan;

  if (json) {
    console.log(
      JSON.stringify({ slot, date: today, generatedAt: now.toISOString(), mainEvent, inputs, candidates: ranked, skipped }, null, 2),
    );
    return;
  }
  const label = plan.covers
    ? `${slot === "morning" ? "아침 편" : "저녁 편(대신 맡음)"}(메인 이벤트 소개)`
    : "저녁 편(키워드·상시 글)";
  console.log(`매거진 글감 후보 · ${label} · ${today} KST\n`);
  for (const line of Object.values(inputs)) console.log(`  재료  ${line}`);
  console.log("");
  if (mainEvent.required) {
    console.log(`  메인 이벤트  ${mainEvent.title} (${mainEvent.eventId}, ${mainEvent.tier}, 하이프 ${mainEvent.hype})`);
    mainEvent.alternates.forEach((alt, i) => console.log(`  대체 ${i + 1}      ${alt.title} (${alt.eventId}, ${alt.tier}, 하이프 ${alt.hype})`));
  } else {
    console.log(`  메인 이벤트  없음: ${mainEvent.reason}`);
  }
  console.log("");
  ranked.forEach((c, i) => {
    const mark = c.role === "main-event" ? " ★반드시" : c.role === "alternate" ? " (대체)" : c.role === "fallback" ? " (일정을 셋 다 못 쓸 때만)" : "";
    console.log(`${String(i + 1).padStart(2)}. [${c.category}·${c.format}] ${c.title}  (점수 ${c.score})${mark}`);
    console.log(`    이유: ${c.reason}`);
    if (c.notes.length) console.log(`    조정: ${c.notes.join(" / ")}`);
    console.log(`    근거 찾을 곳: ${c.sourceHints.join(", ")}`);
  });
  if (!ranked.length) console.log("후보 없음");
  if (skipped.length) console.log(`\n뺀 것 ${skipped.length}개${skipped.length > 8 ? " (앞 8개만)" : ""}:\n  ${skipped.slice(0, 8).join("\n  ")}`);
}

// selftest 가 함수만 가져다 쓸 수 있게, 직접 돌렸을 때만 실행한다
if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) main();
