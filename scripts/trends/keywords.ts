/**
 * 글마다 키워드 후보를 정하고(키 없이 / 모델 태그), 세고, 점수를 매긴다.
 * 세는 일과 점수는 전부 여기 코드가 한다.
 */

import type { TrendCategory, TrendSample } from "../../lib/trends";
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

export function scoreKeywords(posts: Post[], limit = 50): ScoredKeyword[] {
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

  const candidates: Array<ScoredKeyword & { rank: number }> = [];
  for (const [key, g] of groups) {
    if (g.posts.length < 2) continue;
    // 욕설·비하어는 키워드로도 쓰지 않는다
    if (blockedSample.some((w) => key.replace(/ /g, "").includes(w))) continue;
    const sourceCount = new Set(g.posts.map((p) => p.source)).size;
    const singleSource = sourceCount === 1;
    if (isFragmentKey(key, sourceCount)) continue;
    // 사전에 없는 한글 낱말이 한 커뮤니티에서 두 번 나온 것은 근거가 약하다(군말일 때가 많다)
    if (singleSource && g.posts.length < 3 && !KNOWN.has(key) && !/^[a-z0-9]+$/.test(key)) continue;
    const bySource = new Map<string, number[]>();
    for (const post of g.posts) bySource.set(post.source, [...(bySource.get(post.source) ?? []), post.weight]);
    let sum = 0;
    for (const weights of bySource.values()) {
      weights.sort((a, b) => b - a);
      sum += weights.reduce((acc, w, i) => acc + w * SAME_SOURCE_DECAY ** i, 0);
    }
    const sources = [...bySource.keys()].sort();
    const raw = sum * (1 + CROSS_SOURCE_BONUS * (sources.length - 1)) * (weakKeys.has(key) ? WEAK_FACTOR : 1);
    const sensitiveShare = g.posts.filter((p) => p.sensitive || p.llmSensitive).length / g.posts.length;
    const sensitive = isSensitiveKey(key) || sensitiveShare >= 0.5;
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
    });
  }

  // 한 커뮤니티 도배가 1위를 못 하게
  const bestMulti = Math.max(0, ...candidates.filter((c) => c.sources.length > 1).map((c) => c.raw));
  if (bestMulti > 0) {
    for (const c of candidates) {
      if (c.sources.length === 1 && c.raw > bestMulti * SINGLE_SOURCE_CAP) {
        c.raw = bestMulti * SINGLE_SOURCE_CAP;
        c.rank = c.raw * entityBoost(c.key);
      }
    }
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
    if (clash) continue;
    kept.push(c);
    if (kept.length >= limit) break;
  }

  kept.sort((a, b) => b.raw - a.raw);
  for (const k of kept) k.samples = k.sensitive ? [] : pickSamples(k.posts);
  return kept;
}
