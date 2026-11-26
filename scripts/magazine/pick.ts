import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { ARTICLE_CATEGORIES, loadAllArticles, type Article, type ArticleCategory } from "../../lib/articles";
import { loadEvents } from "../../lib/events";
import { TREND_CATEGORIES, type TrendCategory, type TrendKeyword, type TrendsFile } from "../../lib/trends";
import { INTEREST_CATEGORIES, SPORTS, type InterestCategory, type SportEvent } from "../../lib/types";
import { TOPIC_RULES } from "./rules";
import { normalizeTag, titleSimilarity } from "./check";

/**
 * 다음 글감 후보를 점수순으로 낸다.
 *
 *   npm run magazine:pick -- --slot morning          아침 편: 일정·키워드 우선
 *   npm run magazine:pick -- --slot evening          저녁 편: 썰·장비·숫자로 보기 우선
 *   npm run magazine:pick -- --slot evening --json   기계가 읽는 결과
 *   --limit 10                                       몇 개까지 낼지(기본 10)
 *
 * 재료
 *   data/trends.json   민감하지 않고 커뮤니티 2곳 이상에서 나온 키워드
 *   data/events.json   지금부터 7일 안, 하이프 70 이상
 *   scripts/magazine/evergreen.json   언제 써도 되는 글감
 * 빼는 것: 최근 14일 글의 태그·키워드와 겹치는 글감, 이미 쓴 글과 제목이 겹치는 상시 글감,
 *          EDITORIAL 3장 금지어가 든 글감. 직전 두 편과 같은 분류는 점수를 깎는다.
 * 파일이 없거나 비어 있으면 그 재료만 건너뛴다.
 */

type Slot = "morning" | "evening";
type Kind = "trend" | "event" | "evergreen";

interface Candidate {
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
const RECENT_DAYS = 14;
const EVENT_DAYS = 7;
const EVENT_MIN_HYPE = 70;
const TREND_MIN_SOURCES = 2;

/** 아침은 일정·키워드, 저녁은 상시 글감에 더 쳐 준다. */
const SLOT_WEIGHT: Record<Slot, Record<Kind, number>> = {
  morning: { trend: 1.25, event: 1.3, evergreen: 0.8 },
  evening: { trend: 0.6, event: 0.6, evergreen: 1.25 },
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

// ─── 재료 읽기 ─────────────────────────────────────────

function readTrends(): { file: TrendsFile | null; note: string } {
  const path = join(process.cwd(), "data", "trends.json");
  if (!existsSync(path)) return { file: null, note: "data/trends.json 없음(아직 집계 전)" };
  try {
    const parsed = JSON.parse(readFileSync(path, "utf-8")) as TrendsFile;
    if (!Array.isArray(parsed.keywords)) return { file: null, note: "data/trends.json 형식이 다름(keywords 없음)" };
    return { file: parsed, note: `data/trends.json ${parsed.keywords.length}개(집계 ${parsed.generatedAt ?? "시각 없음"})` };
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

function fromTrends(file: TrendsFile | null, skipped: string[]): Candidate[] {
  if (!file) return [];
  const out: Candidate[] = [];
  for (const item of file.keywords as TrendKeyword[]) {
    if (item.sensitive) continue;
    if ((item.sources?.length ?? 0) < TREND_MIN_SOURCES) continue;
    const category = TREND_TO_ARTICLE[item.category];
    if (!category) {
      skipped.push(`키워드 "${item.keyword}": 분류 ${item.category}는 자동 글감에서 뺌`);
      continue;
    }
    const banned = hasBannedTopic(item.keyword);
    if (banned) {
      skipped.push(`키워드 "${item.keyword}": 금지 주제 ${banned}`);
      continue;
    }
    const movement = item.delta === null ? "새로 진입" : item.delta > 0 ? `${item.delta}계단 상승` : item.delta < 0 ? `${-item.delta}계단 하락` : "제자리";
    out.push({
      kind: "trend",
      id: `trend:${item.keyword}`,
      category,
      format: "왜 난리인가",
      title: `키워드 "${item.keyword}", 왜 순위에 올랐나`,
      score: 30 + item.score * 0.5 + Math.min(item.sources.length - TREND_MIN_SOURCES, 3) * 5 + Math.min(item.streak, 3),
      reason: `키워드 순위 ${item.rank}위(점수 ${item.score}, ${movement}), 커뮤니티 ${item.sources.length}곳(${item.sources.join(", ")})에서 글 ${item.mentions}개`,
      tags: [item.keyword],
      keywords: [item.keyword],
      eventIds: [],
      sourceHints: ["본인·소속 단체 공식 발표", "통신사(연합뉴스·로이터) 보도"],
      notes: [],
    });
  }
  return out;
}

function eventCategory(event: SportEvent): ArticleCategory | null {
  if (event.category && INTEREST_TO_ARTICLE[event.category]) return INTEREST_TO_ARTICLE[event.category] ?? null;
  const bySport: Partial<Record<string, ArticleCategory>> = { 야구: "야구", 축구: "축구", 격투기: "격투기", 농구: "농구", "e스포츠": "게임" };
  return bySport[event.sport] ?? null;
}

function fromEvents(now: Date, skipped: string[]): { candidates: Candidate[]; note: string } {
  const file = loadEvents();
  if (!file.events.length) return { candidates: [], note: "data/events.json 없음 또는 0건" };
  const from = now.getTime() - DAY_MS / 4; // 몇 시간 전에 시작한 것까지는 아침 편으로 다룰 수 있다
  const to = now.getTime() + EVENT_DAYS * DAY_MS;
  const seen = new Map<string, Candidate>();
  let inWindow = 0;
  for (const event of file.events) {
    const starts = Date.parse(event.startsAt);
    if (Number.isNaN(starts) || starts < from || starts > to) continue;
    if (event.status === "종료" || event.status === "취소") continue;
    inWindow++;
    if (event.hype < EVENT_MIN_HYPE) continue;
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
    const days = Math.max(0, (starts - now.getTime()) / DAY_MS);
    const dDay = Math.ceil(days) === 0 ? "오늘" : `D-${Math.ceil(days)}`;
    const confidence = event.confidence === "rumored" ? 0.7 : event.confidence === "expected" ? 0.9 : 1;
    const candidate: Candidate = {
      kind: "event",
      id: `event:${event.id}`,
      category,
      format: "프리뷰",
      title: `${event.title} 프리뷰`,
      score: (event.hype - days * 3) * confidence,
      reason: `${dDay}(${event.startsAt.slice(0, 16).replace("T", " ")}), 하이프 ${event.hype}${event.hypeReason ? `(${event.hypeReason})` : ""}, ${event.league}${event.confidence && event.confidence !== "confirmed" ? `, 확정도 ${event.confidence}` : ""}`,
      tags: (event.tags ?? []).slice(0, 6),
      keywords: [],
      eventIds: [event.id],
      sourceHints: [event.sourceUrl ?? event.link ?? "주최 측 공식 공지", "주최 측 공식 공지"].filter((v, i, a) => a.indexOf(v) === i),
      notes: [],
    };
    // 같은 발표가 여러 건으로 들어온 경우 하나만 남긴다
    const key = event.title.toLowerCase().replace(/[^a-z0-9가-힣]/g, "").slice(0, 28);
    const prev = seen.get(key);
    if (!prev || prev.score < candidate.score) {
      if (prev) candidate.notes.push("같은 발표가 여러 건이라 하나로 합침");
      seen.set(key, candidate);
    }
  }
  return {
    candidates: [...seen.values()],
    note: `data/events.json ${file.events.length}건 중 7일 안 ${inWindow}건, 하이프 ${EVENT_MIN_HYPE} 이상 후보 ${seen.size}건`,
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

  // 초안(draft: true)은 아직 낸 글이 아니므로 최근 글·직전 두 편에서 뺀다
  const all = loadAllArticles().filter((a) => !a.draft);
  const recent = all.filter((a) => Math.abs(now.getTime() - Date.parse(a.publishedAt)) <= RECENT_DAYS * DAY_MS);
  const lastTwo = [...all].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, 2);
  const recentSet = recentTerms(recent);

  const skipped: string[] = [];
  const trends = readTrends();
  const evergreen = readEvergreen();
  const events = fromEvents(now, skipped);
  const pool = [
    ...fromTrends(trends.file, skipped),
    ...events.candidates,
    ...fromEvergreen(evergreen.topics, today, slot, all, skipped),
  ];

  const kept: Candidate[] = [];
  for (const candidate of pool) {
    const overlap = overlapsRecent(candidate, recentSet);
    if (overlap) {
      skipped.push(`${candidate.title}: ${overlap}`);
      continue;
    }
    candidate.score *= SLOT_WEIGHT[slot][candidate.kind];
    if (lastTwo.length === 2 && lastTwo.every((a) => a.category === candidate.category)) {
      candidate.score *= SAME_AS_LAST_TWO;
      candidate.notes.push(`직전 두 편이 모두 ${candidate.category}라 크게 깎음(세 편 연속 금지)`);
    } else if (lastTwo[0]?.category === candidate.category || lastTwo[1]?.category === candidate.category) {
      candidate.score *= SAME_AS_LAST;
      candidate.notes.push(`직전 두 편 가운데 ${candidate.category}가 있어 깎음`);
    }
    kept.push(candidate);
  }

  // 같은 분류가 줄줄이 나오지 않게, 위에서부터 고르며 반복 분류를 깎는다
  const ranked: Candidate[] = [];
  const remaining = [...kept];
  const used = new Map<string, number>();
  while (remaining.length && ranked.length < limit) {
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
    events: events.note,
    evergreen: evergreen.note,
    recentArticles: `최근 ${RECENT_DAYS}일 글 ${recent.length}편, 직전 두 편 분류: ${lastTwo.map((a) => a.category).join(", ") || "없음"}`,
  };

  if (json) {
    console.log(JSON.stringify({ slot, date: today, generatedAt: now.toISOString(), inputs, candidates: ranked, skipped }, null, 2));
    return;
  }
  console.log(`매거진 글감 후보 · ${slot === "morning" ? "아침 편(일정·키워드 우선)" : "저녁 편(썰·장비·숫자 우선)"} · ${today} KST\n`);
  for (const line of Object.values(inputs)) console.log(`  재료  ${line}`);
  console.log("");
  ranked.forEach((c, i) => {
    console.log(`${String(i + 1).padStart(2)}. [${c.category}·${c.format}] ${c.title}  (점수 ${c.score})`);
    console.log(`    이유: ${c.reason}`);
    if (c.notes.length) console.log(`    조정: ${c.notes.join(" / ")}`);
    console.log(`    근거 찾을 곳: ${c.sourceHints.join(", ")}`);
  });
  if (!ranked.length) console.log("후보 없음");
  if (skipped.length) console.log(`\n뺀 것 ${skipped.length}개${skipped.length > 8 ? " (앞 8개만)" : ""}:\n  ${skipped.slice(0, 8).join("\n  ")}`);
}

main();
