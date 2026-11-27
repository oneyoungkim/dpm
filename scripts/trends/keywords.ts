/**
 * 글마다 키워드 후보를 정하고(키 없이 / 모델 태그), 세고, 점수를 매긴다.
 * 세는 일과 점수는 전부 여기 코드가 한다.
 */

import type { FmSearchItem, TrendCategory, TrendSample } from "../../lib/trends";
import {
  BLOCKED_SAMPLE_WORDS,
  BOARD_CATEGORY_HINTS,
  CATEGORY_SEEDS,
  SENSITIVE_KEYWORDS,
  SENSITIVE_SUBSTRINGS,
  WEAK_KEYWORDS,
  foldText,
  normalizeKey,
} from "./dictionaries";
import { bareWordSet, canonicalOf, cleanTitle, isStopword, KNOWN, tokenize, type Token } from "./text";
import type { RawPost } from "./types";

/** 집계에 쓰는 글 하나 */
export interface Post extends RawPost {
  idx: number;
  /** 소스 안 반응 순위를 바꾼 무게(소스마다 합이 같다) */
  weight: number;
  tokens: Token[];
  /** 이 글에 붙은 키워드(키 → 화면 이름) */
  keywords: Map<string, string>;
  /** 제목에 민감어가 있나 / 정치 표시 / 성인 게시판 */
  sensitive: boolean;
  /** 모델이 준 분류·민감 판정(있을 때만) */
  llmCategory?: TrendCategory;
  llmSensitive?: boolean;
  /** 모델이 이 글을 처리했나(키워드를 안 줬어도 키 없이 뽑기로 다시 채우지 않는다) */
  llmDone?: boolean;
}

export interface ScoredKeyword {
  key: string;
  keyword: string;
  category: TrendCategory;
  raw: number;
  mentions: number;
  sources: string[];
  sensitive: boolean;
  samples: TrendSample[];
  posts: Post[];
  /** 이 키워드로 모인 에펨코리아 검색어(순위순). 없으면 빈 배열 */
  search: FmSearchItem[];
}

// ---------------------------------------------------------------------------
// 사전 색인
// ---------------------------------------------------------------------------

const seedCategory = new Map<string, TrendCategory>();
for (const [category, words] of Object.entries(CATEGORY_SEEDS) as Array<[TrendCategory, string[]]>) {
  for (const word of words) {
    const key = normalizeKey(canonicalOf(word) ?? word);
    if (!seedCategory.has(key)) seedCategory.set(key, category);
  }
}

const sensitiveKeys = new Set(SENSITIVE_KEYWORDS.map((w) => normalizeKey(canonicalOf(w) ?? w)));
/** 세 글자 이상 민감어는 제목에서 부분 문자열로도 찾는다(윤석열, 국민의힘, 성폭행 …) */
const sensitiveSubstrings = [
  ...SENSITIVE_KEYWORDS.filter((w) => w.length >= 3),
  ...SENSITIVE_SUBSTRINGS,
].map(normalizeKey);
const blockedSample = BLOCKED_SAMPLE_WORDS.map(normalizeKey);
const weakKeys = new Set(WEAK_KEYWORDS.map(normalizeKey));
/** 넓은 말(나라 이름)은 이만큼만 쳐 준다 */
const WEAK_FACTOR = 0.35;

export function categoryOfKey(key: string): TrendCategory | null {
  return seedCategory.get(key) ?? null;
}

export function isSensitiveKey(key: string): boolean {
  return key.split(" ").some((part) => sensitiveKeys.has(part));
}

function titleIsSensitive(title: string, tokens: Token[]): boolean {
  const flat = normalizeKey(title);
  if (sensitiveSubstrings.some((w) => flat.includes(w))) return true;
  return tokens.some((t) => sensitiveKeys.has(t.key));
}

function sampleBlocked(post: Post): boolean {
  if (post.adultBoard || post.sensitive) return true;
  const flat = normalizeKey(post.title);
  return blockedSample.some((w) => flat.includes(w));
}

function boardCategory(post: Post): TrendCategory | null {
  const hints = [post.board, ...cleanTitle(post.title).labels].join(" ");
  for (const [re, category] of BOARD_CATEGORY_HINTS) if (re.test(hints)) return category;
  return null;
}

// ---------------------------------------------------------------------------
// 글 준비: 중복 제거, 반응 무게, 토막
// ---------------------------------------------------------------------------

/** 소스마다 무게 합을 대략 이 값으로 맞춘다(큰 사이트가 작은 사이트를 덮지 않게). 글 수의 제곱근만큼만 차이를 둔다. */
const SOURCE_MASS = 20;
/** 소스당 쓰는 글 수 상한(핫벤처럼 한 쪽에 200줄 나오는 곳) */
const MAX_POSTS_PER_SOURCE = 100;

function engagement(post: RawPost): number {
  return (
    1.0 * Math.log1p(post.likes ?? 0) + 0.6 * Math.log1p(post.comments ?? 0) + 0.4 * Math.log1p(post.views ?? 0)
  );
}

export function preparePosts(raw: RawPost[]): Post[] {
  // 같은 소스 안 같은 주소·같은 제목은 하나로
  const seen = new Set<string>();
  const unique: RawPost[] = [];
  for (const post of raw) {
    if (post.skip) continue;
    const k1 = `${post.source}|${post.url}`;
    const k2 = `${post.source}|${normalizeKey(post.title)}`;
    if (seen.has(k1) || seen.has(k2)) continue;
    seen.add(k1);
    seen.add(k2);
    unique.push(post);
  }

  const bySource = new Map<string, RawPost[]>();
  for (const post of unique) {
    const list = bySource.get(post.source) ?? [];
    if (list.length < MAX_POSTS_PER_SOURCE) list.push(post);
    bySource.set(post.source, list);
  }

  const bare = bareWordSet(unique.map((p) => p.title));
  const posts: Post[] = [];
  for (const list of bySource.values()) {
    // 반응을 소스 안 순위(0~1)로 바꾼다. 같은 값은 같은 순위.
    const scored = list.map((p) => ({ p, e: engagement(p) }));
    const sorted = [...scored].sort((a, b) => a.e - b.e);
    const pct = new Map<RawPost, number>();
    for (let i = 0; i < sorted.length; ) {
      let j = i;
      while (j + 1 < sorted.length && sorted[j + 1].e === sorted[i].e) j++;
      const p = ((i + j) / 2 + 1) / sorted.length;
      for (let k = i; k <= j; k++) pct.set(sorted[k].p, p);
      i = j + 1;
    }
    const base = list.map((p) => 0.4 + 0.6 * (pct.get(p) ?? 0));
    const total = base.reduce((a, b) => a + b, 0) || 1;
    list.forEach((p, i) => {
      const tokens = tokenize(p.title, bare);
      posts.push({
        ...p,
        idx: posts.length,
        // 글 수가 적은 소스(클리앙 첫 쪽만)의 글 하나가 지나치게 무거워지지 않게 제곱근으로 조금 반영
        weight: (base[i] / total) * SOURCE_MASS * Math.sqrt(list.length / 60),
        tokens,
        keywords: new Map(),
        sensitive: Boolean(p.politicsFlag) || Boolean(p.adultBoard) || titleIsSensitive(p.title, tokens),
      });
    });
  }
  return posts;
}

// ---------------------------------------------------------------------------
// 키 없이 키워드 붙이기: 한 낱말 + (늘 붙어 다니는) 두 낱말
// ---------------------------------------------------------------------------

export function tagHeuristic(posts: Post[]): void {
  // 한 낱말이 걸린 글
  const unigramPosts = new Map<string, Set<number>>();
  const bigramPosts = new Map<string, Set<number>>();
  const bigramDisplay = new Map<string, string>();
  for (const post of posts) {
    const toks = post.tokens;
    for (const t of toks) {
      const set = unigramPosts.get(t.key) ?? new Set();
      set.add(post.idx);
      unigramPosts.set(t.key, set);
    }
    for (let i = 0; i + 1 < toks.length; i++) {
      const a = toks[i];
      const b = toks[i + 1];
      if (b.pos !== a.pos + 1 || a.key === b.key) continue;
      const key = `${a.key} ${b.key}`;
      const set = bigramPosts.get(key) ?? new Set();
      set.add(post.idx);
      bigramPosts.set(key, set);
      if (!bigramDisplay.has(key)) bigramDisplay.set(key, `${a.display} ${b.display}`);
    }
  }

  // 두 낱말이 거의 늘 같이 나오면(코카콜라 제로, 중국집 쿠폰) 한 덩어리로 본다
  const phrases = new Map<string, string>(); // "a b" → 화면 이름
  for (const [key, set] of bigramPosts) {
    if (set.size < 2) continue;
    const [a, b] = key.split(" ");
    const na = unigramPosts.get(a)?.size ?? 0;
    const nb = unigramPosts.get(b)?.size ?? 0;
    // 둘 다 사전 이름이면 따로 두는 편이 낫다(T1 제우스 → T1, 제우스)
    if (KNOWN.has(a) && KNOWN.has(b)) continue;
    if (set.size >= 0.7 * na && set.size >= 0.7 * nb) phrases.set(key, bigramDisplay.get(key) ?? key);
  }

  for (const post of posts) {
    if (post.llmDone || post.keywords.size > 0) continue; // 모델 태그가 이미 붙은 글
    const toks = post.tokens;
    const used = new Set<number>();
    for (let i = 0; i + 1 < toks.length; i++) {
      const key = `${toks[i].key} ${toks[i + 1].key}`;
      if (toks[i + 1].pos === toks[i].pos + 1 && phrases.has(key)) {
        post.keywords.set(key, phrases.get(key)!);
        used.add(i).add(i + 1);
      }
    }
    toks.forEach((t, i) => {
      if (!used.has(i) && !post.keywords.has(t.key)) post.keywords.set(t.key, t.display);
    });
  }
}

// ---------------------------------------------------------------------------
// 점수
// ---------------------------------------------------------------------------

/** 한 소스 안에서 같은 말이 여러 번 나오면 덜 쳐 준다(도배 방지) */
const SAME_SOURCE_DECAY = 0.6;
/** 커뮤니티가 하나 늘 때마다 더해 주는 몫 */
const CROSS_SOURCE_BONUS = 0.5;
/** 한 커뮤니티에서만 나온 말은 여러 곳에서 나온 1등 점수의 이 비율을 넘지 못한다 */
const SINGLE_SOURCE_CAP = 0.85;
/** 같은 글 묶음을 공유하는 말들은 하나만 남긴다 */
const OVERLAP_LIMIT = 0.6;

function displayFor(key: string, displays: Map<string, number>): string {
  const canonical = key.includes(" ") ? null : canonicalOf(key);
  if (canonical) return canonical;
  // 제목에 가장 많이 나온 모양(대소문자 포함)
  return [...displays.entries()].sort((a, b) => b[1] - a[1] || a[0].length - b[0].length)[0][0];
}

function entityBoost(key: string): number {
  if (key.includes(" ")) return 1.1;
  if (KNOWN.has(key)) return 1.2;
  if (/^[a-z0-9]+$/.test(key)) return 1.05;
  return 1;
}

function pickCategory(key: string, posts: Post[]): TrendCategory {
  const parts = key.split(" ").reverse(); // 한국어는 뒤 낱말이 중심
  for (const part of [key.replace(/ /g, ""), ...parts]) {
    const seeded = categoryOfKey(part);
    if (seeded) return seeded;
  }
  const votes = new Map<TrendCategory, number>();
  const add = (c: TrendCategory | null | undefined, w: number) => {
    if (c) votes.set(c, (votes.get(c) ?? 0) + w);
  };
  for (const post of posts) {
    add(post.llmCategory, 1.5);
    add(boardCategory(post), 1);
    // 같은 제목에 나온 사전 이름들의 분류
    for (const t of post.tokens) if (t.key !== key) add(categoryOfKey(t.key), 0.5);
  }
  const best = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];
  if (best && best[1] >= posts.length * 0.5) return best[0];
  return "기타";
}

function pickSamples(posts: Post[]): TrendSample[] {
  const ordered = posts.filter((p) => !sampleBlocked(p)).sort((a, b) => b.weight - a.weight);
  const samples: TrendSample[] = [];
  const usedSources = new Set<string>();
  // 먼저 커뮤니티마다 하나씩, 그다음 남은 자리
  for (const pass of [0, 1]) {
    for (const post of ordered) {
      if (samples.length >= 3) break;
      if (samples.some((s) => s.url === post.url)) continue;
      if (pass === 0 && usedSources.has(post.source)) continue;
      usedSources.add(post.source);
      samples.push({ title: foldText(post.title).replace(/\s+/g, " ").trim(), url: post.url, source: post.source });
    }
  }
  return samples;
}

/**
 * 그것만 봐서는 무엇인지 알 수 없는 조각("DR", "3끼", 한 글자). 사전에 있는 이름(AI, T1, KT)은 조각이 아니다.
 * 낱말을 자를 때(text.ts)도 걸러 내지만, 모델이 붙여 준 키워드는 그 길을 거치지 않아서 여기서 한 번 더 본다.
 */
export function isFragmentKey(key: string, sourceCount: number): boolean {
  if (key.includes(" ") || KNOWN.has(key)) return false;
  if (/^[0-9]/.test(key)) return true; // 3끼, 2026
  if (/^[가-힣]$/.test(key)) return true;
  // 영문·숫자 한두 글자는 여러 커뮤니티에 같이 나왔을 때만 인정한다
  if (/^[a-z0-9+&]{1,2}$/.test(key)) return sourceCount < 2;
  return false;
}

// ---------------------------------------------------------------------------
// 에펨코리아 검색어 순위(11-27부터 키워드 순위의 1순위 근거)
//
// 글 제목은 글을 올린 사람의 관심이고, 검색어는 찾아본 사람(에펨 로그인 사용자, 최근 24시간)의 관심이다.
// 서로 다른 신호라 글 근거 위에 더하고, 지금 막 뜨는 말을 제목보다 먼저 잡기 때문에 가장 크게 친다.
// ---------------------------------------------------------------------------

/**
 * 검색어 1위가 받는 가산점 = 이번 집계에서 여러 커뮤니티에 나온 1등 키워드의 글 점수(raw) × 이 값.
 * 검색어가 없는 키워드는 아무리 커도 그 1등 점수(1.0)까지다. 1.5 로 두면 검색어 5위 안쪽(세기 0.67 이상)에
 * 오른 말은 글이 한 개만 있어도 검색어 없는 모든 키워드 위로 간다. 그래서 키워드 순위 위쪽은 검색어 순위가 정하고,
 * 검색어끼리는 글 근거(여러 커뮤니티에 많이 나온 쪽)가 순서를 조금 바꾼다.
 */
export const SEARCH_WEIGHT = 1.5;
/** 검색어 순위가 한 칸 내려갈 때마다 깎는 몫. 1위 1.0 → 5위 0.72 → 10위 0.37 */
export const SEARCH_RANK_STEP = 0.07;
/** 순위가 아무리 낮아도 이만큼은 남긴다(위젯이 20줄로 늘어날 때 대비) */
export const SEARCH_RANK_FLOOR = 0.2;
/**
 * 새로 오른 검색어(new). 지금 막 뜨는 말이라 더 준다.
 * 두 칸 차이(0.14)쯤만 끌어올리게 했다. 더 크면 3위 new 가 1위를 넘어 위젯 순위가 뒤집힌다.
 */
export const SEARCH_NEW_FACTOR = 1.15;
/** 오른 칸마다 ×1.05, 3칸까지(+3 이면 new 와 같다) */
export const SEARCH_UP_STEP = 0.05;
export const SEARCH_UP_MAX = 3;
/** 내린 칸마다 ×0.97, 4칸까지(-4 이하 ×0.88). 순위에 남아 있는 것 자체가 근거라 많이 깎지 않는다 */
export const SEARCH_DOWN_STEP = 0.03;
export const SEARCH_DOWN_MAX = 4;
/**
 * 제목에 한 번도 안 나온 검색어. 무엇을 두고 찾는지 글로 확인할 수 없고 대표 글도 못 붙여 덜 쳐 준다.
 * 0.75 면 검색어 3위 안쪽(×1.5×0.75 ≥ 0.97)은 글 근거 1등과 비슷한 자리, 그 아래는 중간쯤에 놓인다
 * (11-27 실제 집계: 0.6 이면 검색어 3위가 '년생'·'원인' 같은 군말 아래 8위로 밀렸다).
 */
export const SEARCH_ONLY_FACTOR = 0.75;
/**
 * 검색어가 더 긴 키워드의 앞·뒤 조각이면 그 키워드로 묶는다(준표 → 김준표, gta → GTA6, 뮤지컬 → 뮤지컬배우).
 * 글자 차이가 이보다 크면 다른 말로 본다.
 */
const SEARCH_FAMILY_MAX_EXTRA = 4;

/** 검색어 하나의 세기(순위 × 오름·새로 오름). 1위 변화 없음이 1.0 */
export function searchStrength(item: Pick<FmSearchItem, "rank" | "change">): number {
  const base = Math.max(SEARCH_RANK_FLOOR, 1 - SEARCH_RANK_STEP * (item.rank - 1));
  const { change } = item;
  const momentum =
    change === "new"
      ? SEARCH_NEW_FACTOR
      : change > 0
        ? 1 + SEARCH_UP_STEP * Math.min(change, SEARCH_UP_MAX)
        : change < 0
          ? 1 - SEARCH_DOWN_STEP * Math.min(-change, SEARCH_DOWN_MAX)
          : 1;
  return base * momentum;
}

/** 검색어의 비교용 키(별칭이면 정식 이름) */
function searchKeyOf(word: string): string {
  return normalizeKey(canonicalOf(word) ?? word);
}

/**
 * 검색어를 키워드로 쓸 수 있나, 민감한가.
 * 쓸 수 없는 것: 불용어, 욕설·비하어, 조각(한 글자, 숫자로 시작). 민감: 민감어 사전·부분 문자열.
 */
export function searchWordFlags(word: string): { usable: boolean; sensitive: boolean; blocked: boolean } {
  const key = searchKeyOf(word);
  const blocked = blockedSample.some((w) => key.includes(w) || normalizeKey(word).includes(w));
  const usable = Boolean(key) && !blocked && !isStopword(key) && !isStopword(word) && !isFragmentKey(key, 2);
  const sensitive = isSensitiveKey(key) || titleIsSensitive(word, tokenize(word));
  return { usable, sensitive, blocked };
}

/** 검색어 key 가 키워드 groupKey 의 앞·뒤 조각인가(또는 사전 이름인 groupKey 가 검색어의 앞·뒤 조각인가) */
function searchFamily(key: string, groupKey: string): boolean {
  const g = groupKey.replace(/ /g, "");
  if (g === key) return true;
  if (weakKeys.has(key) || weakKeys.has(g)) return false;
  const [short, long, shortIsSearch] = key.length < g.length ? [key, g, true] : [g, key, false];
  if (short.length < 2 || long.length - short.length > SEARCH_FAMILY_MAX_EXTRA) return false;
  // 검색어가 더 길 때는 키워드가 사전 이름일 때만(이동연 → '이동' 같은 군말에 붙지 않게)
  if (!shortIsSearch && !KNOWN.has(groupKey)) return false;
  return long.startsWith(short) || long.endsWith(short);
}

/** 검색어만 있고 키워드로 잡힌 적 없는 말의 화면 이름: 제목에 나온 모양(대소문자), 없으면 위젯 표기 */
function searchDisplay(word: string, posts: Post[]): string {
  const canonical = canonicalOf(word);
  if (canonical) return canonical;
  if (/^[a-z0-9]+$/i.test(word)) {
    const re = new RegExp(word.replace(/[^a-z0-9]/gi, ""), "i");
    for (const post of posts) {
      const m = post.title.match(re);
      if (m) return m[0];
    }
    return word.length <= 4 ? word.toUpperCase() : word;
  }
  return word;
}

export function scoreKeywords(posts: Post[], limit = 50, search: FmSearchItem[] = []): ScoredKeyword[] {
  const groups = new Map<string, { posts: Post[]; displays: Map<string, number> }>();
  for (const post of posts) {
    for (const [key, display] of post.keywords) {
      if (isStopword(key)) continue;
      const g = groups.get(key) ?? { posts: [] as Post[], displays: new Map<string, number>() };
      g.posts.push(post);
      g.displays.set(display, (g.displays.get(display) ?? 0) + 1);
      groups.set(key, g);
    }
  }

  // 검색어를 키워드에 붙인다: 같은 말 → 앞·뒤 조각인 말(글이 많은 쪽) → 없으면 검색어로 새 줄(그 말이 든 제목을 묶어서)
  const searchHits = new Map<string, FmSearchItem[]>();
  for (const item of [...search].sort((a, b) => a.rank - b.rank)) {
    if (!searchWordFlags(item.keyword).usable) continue;
    const key = searchKeyOf(item.keyword);
    let target: string | null = null;
    let best = -1;
    for (const [groupKey, g] of groups) {
      if (isStopword(groupKey) || !searchFamily(key, groupKey)) continue;
      // 글이 많은 쪽, 같으면 같은 말
      const weight = g.posts.length + (groupKey === key ? 0.5 : 0);
      if (weight > best) {
        best = weight;
        target = groupKey;
      }
    }
    if (!target) {
      const raw = normalizeKey(item.keyword);
      const hit = posts.filter((p) => {
        const flat = normalizeKey(cleanTitle(p.title).text);
        return flat.includes(key) || flat.includes(raw);
      });
      groups.set(key, { posts: hit, displays: new Map([[searchDisplay(item.keyword, hit), 1]]) });
      target = key;
    }
    searchHits.set(target, [...(searchHits.get(target) ?? []), item]);
  }

  const candidates: Array<ScoredKeyword & { rank: number }> = [];
  for (const [key, g] of groups) {
    const hits = searchHits.get(key) ?? [];
    const searched = hits.length > 0;
    if (g.posts.length < 2 && !searched) continue;
    // 욕설·비하어는 키워드로도 쓰지 않는다
    if (blockedSample.some((w) => key.replace(/ /g, "").includes(w))) continue;
    const sourceCount = new Set(g.posts.map((p) => p.source)).size;
    const singleSource = sourceCount === 1;
    if (isFragmentKey(key, searched ? 2 : sourceCount)) continue;
    // 사전에 없는 한글 낱말이 한 커뮤니티에서 두 번 나온 것은 근거가 약하다(군말일 때가 많다). 검색어에 오른 말은 예외
    if (!searched && singleSource && g.posts.length < 3 && !KNOWN.has(key) && !/^[a-z0-9]+$/.test(key)) continue;
    const bySource = new Map<string, number[]>();
    for (const post of g.posts) bySource.set(post.source, [...(bySource.get(post.source) ?? []), post.weight]);
    let sum = 0;
    for (const weights of bySource.values()) {
      weights.sort((a, b) => b - a);
      sum += weights.reduce((acc, w, i) => acc + w * SAME_SOURCE_DECAY ** i, 0);
    }
    const sources = [...bySource.keys()].sort();
    const raw = sources.length
      ? sum * (1 + CROSS_SOURCE_BONUS * (sources.length - 1)) * (weakKeys.has(key) ? WEAK_FACTOR : 1)
      : 0;
    const sensitiveShare = g.posts.length
      ? g.posts.filter((p) => p.sensitive || p.llmSensitive).length / g.posts.length
      : 0;
    const sensitive =
      isSensitiveKey(key) || sensitiveShare >= 0.5 || hits.some((h) => searchWordFlags(h.keyword).sensitive);
    candidates.push({
      key,
      keyword: displayFor(key, g.displays),
      category: pickCategory(key, g.posts),
      raw,
      rank: raw * entityBoost(key),
      mentions: g.posts.length,
      sources,
      sensitive,
      samples: [],
      posts: g.posts,
      search: hits,
    });
  }

  // 한 커뮤니티 도배가 1위를 못 하게(글 근거에만 건다. 검색어 가산점은 그 뒤에 더한다)
  const bestMulti = Math.max(0, ...candidates.filter((c) => c.sources.length > 1).map((c) => c.raw));
  if (bestMulti > 0) {
    for (const c of candidates) {
      if (c.sources.length === 1 && c.raw > bestMulti * SINGLE_SOURCE_CAP) {
        c.raw = bestMulti * SINGLE_SOURCE_CAP;
        c.rank = c.raw * entityBoost(c.key);
      }
    }
  }

  // 검색어 가산점. 기준은 글 근거 1등(여러 커뮤니티에 나온 것, 없으면 전체 1등)이라 집계마다 크기가 맞춰진다
  const reference = bestMulti > 0 ? bestMulti : Math.max(0, ...candidates.map((c) => c.raw)) || 1;
  // 넓은 말(나라 이름)은 검색어로 올라도 글 점수와 같은 비율(WEAK_FACTOR)만 쳐 준다
  const searchBonus = (c: { key: string; search: FmSearchItem[]; mentions: number }) =>
    c.search.length === 0
      ? 0
      : SEARCH_WEIGHT *
        reference *
        Math.max(...c.search.map(searchStrength)) *
        (c.mentions === 0 ? SEARCH_ONLY_FACTOR : 1) *
        (weakKeys.has(c.key) ? WEAK_FACTOR : 1);
  for (const c of candidates) {
    if (!c.search.length) continue;
    c.raw += searchBonus(c);
    c.rank = c.raw * entityBoost(c.key);
  }

  // 같은 글 묶음을 나눠 가진 말(중국산·쏘나타·부품·불량)은 대표 하나만
  candidates.sort((a, b) => b.rank - a.rank);
  const kept: typeof candidates = [];
  for (const c of candidates) {
    const ids = new Set(c.posts.map((p) => p.idx));
    const clash = kept.find((k) => {
      const kIds = new Set(k.posts.map((p) => p.idx));
      let inter = 0;
      for (const id of ids) if (kIds.has(id)) inter++;
      const smaller = Math.min(ids.size, kIds.size);
      const union = ids.size + kIds.size - inter;
      return inter / union >= OVERLAP_LIMIT || inter / smaller >= 0.8;
    });
    if (clash) {
      // 같은 글 묶음이면 같은 이야기다. 빠지는 쪽이 받은 검색어는 남는 쪽으로 옮긴다(더 센 검색어면 가산점도 그만큼 올린다)
      if (c.search.length) {
        const before = searchBonus(clash);
        clash.search = [...clash.search, ...c.search].sort((a, b) => a.rank - b.rank);
        clash.raw += searchBonus(clash) - before;
        clash.rank = clash.raw * entityBoost(clash.key);
        if (c.search.some((h) => searchWordFlags(h.keyword).sensitive)) clash.sensitive = true;
      }
      continue;
    }
    kept.push(c);
    if (kept.length >= limit) break;
  }

  kept.sort((a, b) => b.raw - a.raw);
  for (const k of kept) k.samples = k.sensitive ? [] : pickSamples(k.posts);
  return kept;
}
