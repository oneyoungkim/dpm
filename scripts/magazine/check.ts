import { readdirSync, readFileSync, existsSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";
import matter from "gray-matter";
import {
  ARTICLES_DIR,
  articleFrontmatterSchema,
  countBodyChars,
  parseArticle,
  type Article,
} from "../../lib/articles";
import {
  BANNED_SOURCE_HOSTS,
  CAUTION_SOURCE_HOSTS,
  CONNECTOR_OPENERS,
  LIMITS,
  OPENING_GREETING,
  PHRASE_RULES,
  SECOND_LEVEL_SUFFIXES,
  TITLE_BANNED,
  TOPIC_RULES,
  type HostRule,
  type PhrasePattern,
} from "./rules";

/**
 * 매거진 글 검사. 발행 전 마지막 문이다.
 *
 *   npm run magazine:check                         content/articles/*.md 전부
 *   npm run magazine:check -- 파일.md 파일2.md       고른 파일만
 *   npm run magazine:check -- --offline            근거 주소 열어 보기를 건너뜀
 *   npm run magazine:check -- --json               기계가 읽는 결과
 *   npm run magazine:check -- --articles-dir 폴더  최근 글·slug 중복 비교에 쓸 폴더(기본 content/articles)
 *   npm run magazine:check -- --include-drafts     파일을 고르지 않았을 때 draft: true 글도 검사
 *
 * 파일을 고르지 않으면 draft: true 인 글은 건너뛴다(낼 글만 막는다). 고른 파일은 초안이어도 검사한다.
 *
 * 오류가 하나라도 있으면 종료 코드 1, 경고만 있으면 0.
 * 규칙과 낱말 목록은 scripts/magazine/rules.ts 에 있다.
 */

export type Level = "error" | "warning";

export interface Finding {
  level: Level;
  /** 규칙 id(rules.ts) */
  rule: string;
  /** EDITORIAL.md 장 번호 */
  section: string;
  /** 파일 안 줄 번호(1부터). 파일 전체에 걸린 것이면 null */
  line: number | null;
  /** 걸린 글자 또는 앞뒤 조금 */
  text: string;
  message: string;
}

export interface FileReport {
  file: string;
  slug: string | null;
  chars: number | null;
  errors: Finding[];
  warnings: Finding[];
  /** 걸리지 않은 이유 같은 참고(예: 글자 그대로 쓴 "체급"은 세지 않음) */
  notes: string[];
}

export interface CheckOptions {
  offline: boolean;
  /** 최근 글 겹침·분류 연속·slug 중복을 볼 폴더 */
  articlesDir: string;
}

type LineKind = "blank" | "h1" | "heading" | "table" | "list" | "quote" | "code" | "para" | "meta";

interface ScanLine {
  /** 파일 안 줄 번호 */
  n: number;
  kind: LineKind;
  /** 원문 줄 */
  raw: string;
  /** 링크 주소·인라인 코드를 걷어 낸 글 */
  text: string;
}

const DAY_MS = 86_400_000;

// ─── 작은 도구 ─────────────────────────────────────────

function globalize(re: RegExp): RegExp {
  return new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
}

/** 따옴표 안을 같은 길이의 빈칸으로 바꾼다(위치는 그대로). */
function maskQuotes(text: string): string {
  return text.replace(/“[^”]*”|"[^"]*"|‘[^’]*’|「[^」]*」|『[^』]*』/g, (m) => " ".repeat(m.length));
}

/** idx가 든 문장 */
function sentenceAt(text: string, idx: number): string {
  let start = idx;
  while (start > 0 && !/[.!?]/.test(text[start - 1])) start--;
  let end = idx;
  while (end < text.length && !/[.!?]/.test(text[end])) end++;
  return text.slice(start, end + 1);
}

function snippet(text: string, idx: number, len: number): string {
  const from = Math.max(0, idx - 12);
  const to = Math.min(text.length, idx + len + 12);
  return `${from > 0 ? "…" : ""}${text.slice(from, to).trim()}${to < text.length ? "…" : ""}`;
}

function splitSentences(text: string): string[] {
  const out: string[] = [...(text.match(/[^.!?]+[.!?]+["”’')\]]*/g) ?? [])];
  const rest = text.replace(/[^.!?]+[.!?]+["”’')\]]*/g, "").trim();
  if (rest) out.push(rest);
  return out.map((s) => s.trim()).filter(Boolean);
}

function cleanInline(line: string): string {
  return line
    .replace(/`[^`]*`/g, (m) => " ".repeat(m.length))
    .replace(/\]\([^)]*\)/g, (m) => "]" + " ".repeat(m.length - 1));
}

/** 같은 회사의 하위 도메인은 한 곳으로 센다. */
export function registrableDomain(host: string): string {
  const parts = host.toLowerCase().replace(/^www\./, "").split(".");
  if (parts.length <= 2) return parts.join(".");
  const lastTwo = parts.slice(-2).join(".");
  return SECOND_LEVEL_SUFFIXES.has(lastTwo) ? parts.slice(-3).join(".") : lastTwo;
}

function matchHost(url: URL, rules: HostRule[]): HostRule | undefined {
  const host = url.hostname.toLowerCase();
  return rules.find(
    (rule) =>
      (host === rule.host || host.endsWith(`.${rule.host}`)) && !(rule.allowPath && rule.allowPath.test(url.pathname)),
  );
}

function bigrams(text: string): Set<string> {
  const norm = text.toLowerCase().replace(/[^가-힣a-z0-9]/g, "");
  const set = new Set<string>();
  for (let i = 0; i < norm.length - 1; i++) set.add(norm.slice(i, i + 2));
  return set;
}

/** 두 제목의 두 글자 묶음 겹침(Dice, 0~1) */
export function titleSimilarity(a: string, b: string): number {
  const x = bigrams(a);
  const y = bigrams(b);
  if (!x.size || !y.size) return 0;
  let shared = 0;
  for (const gram of x) if (y.has(gram)) shared++;
  return (2 * shared) / (x.size + y.size);
}

export function normalizeTag(tag: string): string {
  return tag.toLowerCase().replace(/\s+/g, "");
}

// ─── 줄 나누기 ─────────────────────────────────────────

interface Parsed {
  lines: string[];
  /** 머리말 key → 줄 번호 */
  fmLine: (key: string) => number | null;
  /** 머리말에서 그 글자가 든 첫 줄 */
  fmValueLine: (value: string) => number | null;
  body: ScanLine[];
}

function splitFile(raw: string): Parsed {
  const lines = raw.split(/\r?\n/);
  let fmEnd = -1;
  if (lines[0]?.trim() === "---") {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "---") {
        fmEnd = i;
        break;
      }
    }
  }
  const fmLine = (key: string) => {
    for (let i = 1; i < fmEnd; i++) if (new RegExp(`^${key}\\s*:`).test(lines[i])) return i + 1;
    return null;
  };
  const fmValueLine = (value: string) => {
    for (let i = 1; i < fmEnd; i++) if (lines[i].includes(value)) return i + 1;
    return null;
  };

  const body: ScanLine[] = [];
  let inCode = false;
  for (let i = fmEnd + 1; i < lines.length; i++) {
    const raw = lines[i];
    const n = i + 1;
    if (/^\s*(```|~~~)/.test(raw)) {
      inCode = !inCode;
      body.push({ n, kind: "code", raw, text: "" });
      continue;
    }
    let kind: LineKind;
    if (inCode) kind = "code";
    else if (!raw.trim()) kind = "blank";
    else if (/^#\s/.test(raw)) kind = "h1";
    else if (/^#{2,6}\s/.test(raw)) kind = "heading";
    else if (/^\s*\|/.test(raw)) kind = "table";
    else if (/^\s*([-*+]|\d+\.)\s/.test(raw)) kind = "list";
    else if (/^\s*>/.test(raw)) kind = "quote";
    else kind = "para";
    body.push({ n, kind, raw, text: kind === "code" ? "" : cleanInline(raw) });
  }
  return { lines, fmLine, fmValueLine, body };
}

// ─── 말 규칙 ───────────────────────────────────────────

interface Hit {
  line: number | null;
  text: string;
  label: string;
}

function scanPatterns(
  scanLines: ScanLine[],
  patterns: PhrasePattern[],
  skipQuotes: boolean,
  literalSkipped: Map<string, number>,
): Hit[] {
  const hits: Hit[] = [];
  for (const line of scanLines) {
    if (line.kind === "code" || line.kind === "blank") continue;
    const text = skipQuotes ? maskQuotes(line.text) : line.text;
    for (const pattern of patterns) {
      for (const match of text.matchAll(globalize(pattern.re))) {
        const idx = match.index ?? 0;
        const label = pattern.label ?? match[0];
        if (pattern.literalIf?.length) {
          const sentence = sentenceAt(line.text, idx);
          if (pattern.literalIf.some((re) => re.test(sentence))) {
            literalSkipped.set(label, (literalSkipped.get(label) ?? 0) + 1);
            continue;
          }
        }
        hits.push({ line: line.kind === "meta" ? line.n || null : line.n, text: snippet(line.text, idx, match[0].length), label });
      }
    }
  }
  return hits;
}

// ─── 글 하나 검사 ──────────────────────────────────────

interface Corpus {
  articles: { path: string; article: Article }[];
  /** slug → 파일 경로들(머리말이 깨진 글 포함) */
  slugs: Map<string, string[]>;
}

function loadCorpus(dir: string): Corpus {
  const corpus: Corpus = { articles: [], slugs: new Map() };
  if (!existsSync(dir)) return corpus;
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".md"))) {
    const path = resolve(dir, name);
    const raw = readFileSync(path, "utf-8");
    try {
      const slug = matter(raw).data?.slug;
      if (typeof slug === "string") corpus.slugs.set(slug, [...(corpus.slugs.get(slug) ?? []), path]);
    } catch {
      // 머리말이 깨진 글은 slug 비교에서만 빠진다
    }
    try {
      const article = parseArticle(name, raw);
      // 초안은 아직 낸 글이 아니므로 겹침·분류 연속 비교에서 뺀다(slug 중복은 본다)
      if (!article.draft) corpus.articles.push({ path, article });
    } catch {
      // 스키마가 깨진 글은 겹침 비교에서 빠진다(그 글 자체의 검사에서 잡힌다)
    }
  }
  return corpus;
}

function checkOne(path: string, raw: string, corpus: Corpus, checkedSlugs: Map<string, string[]>): FileReport {
  const file = relative(process.cwd(), path) || path;
  const report: FileReport = { file, slug: null, chars: null, errors: [], warnings: [], notes: [] };
  const add = (level: Level, rule: string, section: string, line: number | null, text: string, message: string) =>
    (level === "error" ? report.errors : report.warnings).push({ level, rule, section, line, text, message });

  const parsed = splitFile(raw);
  let data: Record<string, unknown> = {};
  let content = "";
  try {
    const result = matter(raw);
    data = result.data as Record<string, unknown>;
    content = result.content;
  } catch (error) {
    add("error", "schema", "6", 1, "", `머리말(YAML)을 읽지 못함: ${error instanceof Error ? error.message : error}`);
    return report;
  }

  // 1. 스키마
  const schema = articleFrontmatterSchema.safeParse(data);
  if (!schema.success) {
    for (const issue of schema.error.issues) {
      const key = String(issue.path[0] ?? "");
      add(
        "error",
        "schema",
        "6",
        key ? parsed.fmLine(key) : 1,
        issue.path.join(".") || "(머리말)",
        `머리말 스키마(lib/articles.ts): ${issue.message}`,
      );
    }
  }
  const str = (key: string) => (typeof data[key] === "string" ? (data[key] as string) : "");
  const arr = (key: string) => (Array.isArray(data[key]) ? (data[key] as unknown[]).map(String) : []);
  const title = str("title");
  const deck = str("deck");
  const slug = str("slug");
  const publishedAt = str("publishedAt");
  const category = str("category");
  const tags = arr("tags");
  const keywords = arr("keywords");
  report.slug = slug || null;

  // 2. 파일 이름
  const name = basename(path);
  const nameMatch = name.match(/^(\d{4}-\d{2}-\d{2})-([a-z0-9]+(?:-[a-z0-9]+)*)\.md$/);
  if (!nameMatch) {
    add("error", "filename", "6", null, name, "파일 이름은 YYYY-MM-DD-<slug>.md (slug는 영문 소문자·숫자·하이픈)");
  } else {
    if (publishedAt && nameMatch[1] !== publishedAt.slice(0, 10))
      add("error", "filename", "6", parsed.fmLine("publishedAt"), `${nameMatch[1]} ≠ ${publishedAt.slice(0, 10)}`, "파일 이름의 날짜와 publishedAt 날짜가 다름");
    if (slug && nameMatch[2] !== slug)
      add("error", "filename", "6", parsed.fmLine("slug"), `${nameMatch[2]} ≠ ${slug}`, "파일 이름 뒷부분과 slug가 다름");
  }

  // 3. slug 중복
  if (slug) {
    const others = [...(corpus.slugs.get(slug) ?? []), ...(checkedSlugs.get(slug) ?? [])].filter((p) => p !== path);
    const unique = [...new Set(others)];
    if (unique.length)
      add("error", "slug-dup", "6", parsed.fmLine("slug"), slug, `slug가 다른 글과 같음: ${unique.map((p) => relative(process.cwd(), p)).join(", ")}`);
  }

  // 4. 본문 길이·모양
  const body = content.trim();
  const chars = countBodyChars(body);
  report.chars = chars;
  if (chars < LIMITS.bodyMin || chars > LIMITS.bodyMax)
    add("error", "body-length", "6", null, `${chars.toLocaleString("ko-KR")}자`, `본문은 공백 빼고 ${LIMITS.bodyMin.toLocaleString("ko-KR")}~${LIMITS.bodyMax.toLocaleString("ko-KR")}자`);

  const h2 = parsed.body.filter((l) => l.kind === "heading" && /^##\s/.test(l.raw));
  if (h2.length < LIMITS.h2Min || h2.length > LIMITS.h2Max)
    add("error", "h2-count", "6", h2[0]?.n ?? null, `${h2.length}개`, `소제목(##)은 ${LIMITS.h2Min}~${LIMITS.h2Max}개`);
  for (const line of parsed.body) {
    if (line.kind === "h1") add("error", "h1", "6", line.n, line.raw.trim(), "본문에 # 제목(h1)을 쓰지 않는다. 제목은 머리말에만");
    if (line.kind === "code") continue;
    for (const m of line.text.matchAll(/<\/?[a-zA-Z][a-zA-Z0-9-]*(?:\s[^<>]*)?\/?>|<!--/g))
      add("error", "html", "6", line.n, m[0], "본문에 HTML 태그를 쓰지 않는다");
    for (const m of line.raw.matchAll(/!\[[^\]]*\]\([^)]*\)/g))
      add("error", "body-image", "6", line.n, m[0], "이미지는 머리말 image 하나만");
  }

  // 5. 근거
  const sources = Array.isArray(data.sources) ? (data.sources as { url?: unknown }[]) : [];
  const urls: URL[] = [];
  for (const source of sources) {
    if (typeof source?.url !== "string") continue;
    try {
      urls.push(new URL(source.url));
    } catch {
      // 주소 형식은 스키마가 잡는다
    }
  }
  const distinctUrls = new Set(urls.map((u) => u.href.replace(/[#?].*$/, "").replace(/\/$/, "")));
  if (urls.length >= LIMITS.minSources && distinctUrls.size < LIMITS.minSources)
    add("error", "sources-count", "4", parsed.fmLine("sources"), `서로 다른 주소 ${distinctUrls.size}개`, `근거는 서로 다른 주소 ${LIMITS.minSources}개 이상`);
  const hosts = new Set(urls.map((u) => registrableDomain(u.hostname)));
  if (urls.length && hosts.size < LIMITS.minHosts)
    add("error", "sources-hosts", "4", parsed.fmLine("sources"), [...hosts].join(", "), `근거 사이트는 서로 다른 곳 ${LIMITS.minHosts}곳 이상`);
  for (const url of urls) {
    const banned = matchHost(url, BANNED_SOURCE_HOSTS);
    if (banned) add("error", "source-banned-host", "4", parsed.fmValueLine(url.hostname), url.href, `근거로 쓰지 않는 곳: ${banned.reason}`);
    const caution = matchHost(url, CAUTION_SOURCE_HOSTS);
    if (caution) add("warning", "source-caution-host", "4", parsed.fmValueLine(url.hostname), url.href, caution.reason);
  }

  // 6. 제목·첫 문단
  for (const re of TITLE_BANNED) {
    const m = title.match(re);
    if (m) add("error", "title-banned", "6", parsed.fmLine("title"), m[0], "제목에 느낌표·\"충격\"·\"소름\"을 쓰지 않는다");
  }
  const firstPara = parsed.body.find((l) => l.kind === "para");
  if (firstPara) {
    for (const re of OPENING_GREETING) {
      const m = firstPara.text.match(re);
      if (m) add("error", "opening-greeting", "6", firstPara.n, m[0], "첫 문단은 이 글이 다루는 사실로 연다. 인사·\"오늘은 ~를 알아보\"로 열지 않는다");
    }
  }

  // 7. 5장 문장 규칙(제목·부제·본문)
  const metaLines: ScanLine[] = [
    { n: parsed.fmLine("title") ?? 0, kind: "meta", raw: title, text: title },
    { n: parsed.fmLine("deck") ?? 0, kind: "meta", raw: deck, text: deck },
  ];
  const scanLines = [...metaLines, ...parsed.body];
  const literalSkipped = new Map<string, number>();
  for (const rule of PHRASE_RULES) {
    const hits = scanPatterns(scanLines, rule.patterns, rule.skipQuotes, literalSkipped);
    if (!hits.length) continue;
    const tag = `${rule.title}`;
    if (rule.mode === "first-hit") {
      for (const hit of hits) add("error", rule.id, rule.section, hit.line, hit.text, `${tag}: "${hit.label}" (한 번도 안 됨). ${rule.hint}`);
    } else if (rule.mode === "clustered") {
      const threshold = rule.threshold ?? 3;
      const level: Level = hits.length >= threshold ? "error" : "warning";
      for (const hit of hits)
        add(level, rule.id, rule.section, hit.line, hit.text, `${tag}: "${hit.label}" (글 전체 ${hits.length}번, ${threshold}번부터 실패). ${rule.hint}`);
    } else {
      for (const hit of hits) add("warning", rule.id, rule.section, hit.line, hit.text, `${tag}: "${hit.label}". ${rule.hint}`);
    }
  }
  for (const [label, count] of literalSkipped)
    report.notes.push(`"${label}" ${count}곳은 숫자·단위·체급 이름 같은 말과 같은 문장에 있어 글자 그대로 쓴 것으로 보고 세지 않음`);

  // 8. 문장 흐름: "~습니다." 연속, 접속어로 여는 문장, 짧은 단정문 쌓기
  let streak = 0;
  let streakStart = 0;
  let streakReported = false;
  let short = 0;
  let shortStart = 0;
  let shortReported = false;
  for (const line of parsed.body) {
    if (line.kind === "blank") continue;
    if (line.kind !== "para" && line.kind !== "quote") {
      streak = 0;
      streakReported = false;
      short = 0;
      shortReported = false;
      continue;
    }
    const sentences = splitSentences(line.text.replace(/^\s*>\s?/, ""));
    let connectors = 0;
    for (const sentence of sentences) {
      if (CONNECTOR_OPENERS.test(sentence)) connectors++;
      const plain = sentence.replace(/["”’')\]]+$/, "");
      if (plain.endsWith("습니다.")) {
        if (streak === 0) streakStart = line.n;
        streak++;
        if (streak >= LIMITS.seumnidaStreak && !streakReported) {
          add("error", "seumnida-streak", "5", streakStart, sentence.slice(0, 40), `"~습니다."로 끝나는 문장이 ${LIMITS.seumnidaStreak}번 이어짐(${streakStart}~${line.n}행). ~죠·~거든요·~는데요나 다른 모양으로 바꾼다`);
          streakReported = true;
        }
      } else {
        streak = 0;
        streakReported = false;
      }
      if (plain.endsWith("다.") && sentence.replace(/\s/g, "").length <= LIMITS.shortSentenceChars) {
        if (short === 0) shortStart = line.n;
        short++;
        if (short >= LIMITS.shortStack && !shortReported) {
          add("warning", "short-stack", "5-9", shortStart, sentence, `짧은 단정문이 ${LIMITS.shortStack}개 이상 이어짐. 이어지는 말로 묶는다`);
          shortReported = true;
        }
      } else {
        short = 0;
        shortReported = false;
      }
    }
    if (connectors > LIMITS.connectorOpenersPerParagraph)
      add("error", "connector-openers", "5-9", line.n, `${connectors}문장`, `한 문단에서 "또한·그리고·한편·하지만"으로 여는 문장이 ${LIMITS.connectorOpenersPerParagraph}개를 넘음`);
  }

  // 9. 3장 금지 주제어(따옴표 안 포함, 제목·부제·태그·키워드·본문)
  const topicLines: ScanLine[] = [
    ...metaLines,
    ...[...tags, ...keywords].map((value) => ({ n: parsed.fmValueLine(value) ?? 0, kind: "meta" as const, raw: value, text: value })),
    ...parsed.body,
  ];
  for (const rule of TOPIC_RULES) {
    const hits = scanPatterns(topicLines, rule.patterns, false, new Map());
    for (const hit of hits)
      add(rule.mode === "first-hit" ? "error" : "warning", rule.id, rule.section, hit.line, hit.text, `${rule.title}: "${hit.label}". ${rule.hint}`);
  }

  // 10. 최근 글과 겹침, 같은 분류 세 편 연속(2장)
  const published = Date.parse(publishedAt);
  if (!Number.isNaN(published)) {
    const myTags = new Set(tags.map(normalizeTag));
    for (const { path: otherPath, article } of corpus.articles) {
      if (otherPath === path) continue;
      const days = Math.abs(Date.parse(article.publishedAt) - published) / DAY_MS;
      if (days > LIMITS.recentTitleDays) continue;
      const similarity = titleSimilarity(title, article.title);
      if (similarity >= LIMITS.titleSimilarity)
        add("error", "recent-overlap", "2", parsed.fmLine("title"), `${article.title} (${article.file})`, `최근 ${LIMITS.recentTitleDays}일 안의 글과 제목이 겹침(${Math.round(similarity * 100)}%). 새 사실이 없으면 쓰지 않는다`);
      const shared = article.tags.filter((tag) => myTags.has(normalizeTag(tag)));
      if (shared.length >= LIMITS.tagOverlap)
        add(
          days <= LIMITS.recentTagErrorDays ? "error" : "warning",
          "recent-overlap",
          "2",
          parsed.fmLine("tags"),
          `${shared.join(", ")} (${article.file}, ${Math.round(days)}일 차이)`,
          `최근 글과 태그 ${shared.length}개가 겹침. ${LIMITS.recentTagErrorDays}일 안이면 실패, ${LIMITS.recentTitleDays}일 안이면 경고`,
        );
    }
    const before = corpus.articles
      .filter(({ path: p, article }) => p !== path && Date.parse(article.publishedAt) < published)
      .sort((a, b) => b.article.publishedAt.localeCompare(a.article.publishedAt))
      .slice(0, 2);
    if (category && before.length === 2 && before.every(({ article }) => article.category === category))
      add("error", "category-streak", "2", parsed.fmLine("category"), category, `직전 두 편(${before.map((b) => b.article.file).join(", ")})과 같은 분류. 같은 분류를 세 편 연달아 내지 않는다`);
  }

  return report;
}

// ─── 근거 주소 열어 보기 ───────────────────────────────

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

async function probe(url: string): Promise<string | null> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), LIMITS.urlTimeoutMs);
    try {
      const res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/pdf,*/*" },
        signal: ac.signal,
      });
      await res.body?.cancel().catch(() => undefined);
      if (res.status < 400) return null;
      if ([401, 403, 429].includes(res.status)) return `HTTP ${res.status} (자동 요청을 막는 곳일 수 있음. 브라우저로 열어 본다)`;
      return `HTTP ${res.status}`;
    } catch (error) {
      const msg = ac.signal.aborted ? `${LIMITS.urlTimeoutMs / 1000}초 안에 응답 없음` : error instanceof Error ? error.message : String(error);
      if (attempt === 2) return msg;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

async function checkUrls(reports: FileReport[], files: { path: string; raw: string }[]): Promise<void> {
  const byUrl = new Map<string, { report: FileReport; line: number | null }[]>();
  files.forEach(({ raw }, i) => {
    let data: Record<string, unknown> = {};
    try {
      data = matter(raw).data as Record<string, unknown>;
    } catch {
      return;
    }
    const parsed = splitFile(raw);
    const list: string[] = [];
    if (Array.isArray(data.sources)) for (const s of data.sources as { url?: unknown }[]) if (typeof s?.url === "string") list.push(s.url);
    const image = data.image as { sourceUrl?: unknown; url?: unknown } | undefined;
    if (typeof image?.sourceUrl === "string") list.push(image.sourceUrl);
    if (typeof image?.url === "string") list.push(image.url);
    for (const url of list) {
      if (!/^https?:\/\//.test(url)) continue;
      byUrl.set(url, [...(byUrl.get(url) ?? []), { report: reports[i], line: parsed.fmValueLine(url) }]);
    }
  });
  const queue = [...byUrl.keys()];
  const worker = async () => {
    for (let url = queue.shift(); url; url = queue.shift()) {
      const problem = await probe(url);
      if (!problem) continue;
      for (const { report, line } of byUrl.get(url) ?? [])
        report.warnings.push({ level: "warning", rule: "source-unreachable", section: "4", line, text: url, message: `근거 주소가 열리지 않음: ${problem}` });
    }
  };
  await Promise.all(Array.from({ length: LIMITS.urlConcurrency }, worker));
}

// ─── 바깥에서 부르는 곳 ────────────────────────────────

export async function checkFiles(paths: string[], options: CheckOptions): Promise<FileReport[]> {
  const corpus = loadCorpus(options.articlesDir);
  const files = paths.map((p) => ({ path: resolve(p), raw: readFileSync(p, "utf-8") }));
  const checkedSlugs = new Map<string, string[]>();
  for (const { path, raw } of files) {
    try {
      const slug = matter(raw).data?.slug;
      if (typeof slug === "string") checkedSlugs.set(slug, [...(checkedSlugs.get(slug) ?? []), path]);
    } catch {
      // 머리말 오류는 checkOne이 알린다
    }
  }
  const reports = files.map(({ path, raw }) => checkOne(path, raw, corpus, checkedSlugs));
  if (!options.offline) await checkUrls(reports, files);
  for (const report of reports) {
    const byLine = (a: Finding, b: Finding) => (a.line ?? 0) - (b.line ?? 0);
    report.errors.sort(byLine);
    report.warnings.sort(byLine);
  }
  return reports;
}

/** "5-10" → "5장 10번", "4" → "4장" */
function sectionLabel(section: string): string {
  const [chapter, item] = section.split("-");
  return item ? `${chapter}장 ${item}번` : `${chapter}장`;
}

function printHuman(reports: FileReport[], offline: boolean): void {
  console.log(`매거진 검사: ${reports.length}개 파일${offline ? " (근거 주소 열어 보기 건너뜀)" : ""}\n`);
  for (const report of reports) {
    const state = report.errors.length ? "실패" : "통과";
    console.log(`[${state}] ${report.file}  본문 ${report.chars?.toLocaleString("ko-KR") ?? "?"}자 · 오류 ${report.errors.length} · 경고 ${report.warnings.length}`);
    for (const f of [...report.errors, ...report.warnings]) {
      const where = f.line ? `${f.line}행` : "파일";
      console.log(`  ${f.level === "error" ? "오류" : "경고"} ${where} [${sectionLabel(f.section)} ${f.rule}] ${f.message}`);
      if (f.text) console.log(`       걸린 곳: ${f.text}`);
    }
    for (const note of report.notes) console.log(`  참고 ${note}`);
    console.log("");
  }
  const failed = reports.filter((r) => r.errors.length).length;
  console.log(`결과: ${reports.length - failed}개 통과, ${failed}개 실패`);
}

async function main() {
  const args = process.argv.slice(2);
  const json = args.includes("--json");
  const offline = args.includes("--offline");
  const dirIdx = args.indexOf("--articles-dir");
  const articlesDir = dirIdx >= 0 ? resolve(args[dirIdx + 1]) : ARTICLES_DIR;
  const files = args.filter((a, i) => !a.startsWith("--") && !(dirIdx >= 0 && i === dirIdx + 1));
  let skippedDrafts: string[] = [];
  let targets = files;
  if (!files.length) {
    const all = existsSync(articlesDir)
      ? readdirSync(articlesDir).filter((f) => f.endsWith(".md")).map((f) => join(articlesDir, f))
      : [];
    if (args.includes("--include-drafts")) targets = all;
    else {
      const isDraft = (p: string) => {
        try {
          return matter(readFileSync(p, "utf-8")).data?.draft === true;
        } catch {
          return false; // 머리말이 깨진 글은 검사에서 잡히게 둔다
        }
      };
      skippedDrafts = all.filter(isDraft);
      targets = all.filter((p) => !isDraft(p));
    }
  }
  if (skippedDrafts.length && !json)
    console.log(`초안(draft: true) ${skippedDrafts.length}개 건너뜀: ${skippedDrafts.map((p) => basename(p)).join(", ")}\n`);
  if (!targets.length) {
    if (json) console.log(JSON.stringify({ ok: true, files: [], skippedDrafts: skippedDrafts.map((p) => basename(p)) }, null, 2));
    else console.log("검사할 글이 없음");
    return;
  }
  const missing = targets.filter((t) => !existsSync(t));
  if (missing.length) {
    console.error(`파일이 없음: ${missing.join(", ")}`);
    process.exit(1);
  }
  const reports = await checkFiles(targets, { offline, articlesDir });
  const ok = reports.every((r) => !r.errors.length);
  if (json) console.log(JSON.stringify({ ok, files: reports, skippedDrafts: skippedDrafts.map((p) => basename(p)) }, null, 2));
  else printHuman(reports, offline);
  process.exit(ok ? 0 : 1);
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(__filename)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
