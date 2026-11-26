import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import matter from "gray-matter";
import { z } from "zod";

/**
 * 매거진 글.
 * 글 하나 = content/articles/YYYY-MM-DD-slug.md 파일 하나(머리말 + 마크다운 본문).
 * 사이트와 scripts/magazine/* 가 같은 스키마(articleFrontmatterSchema)를 쓴다.
 */

/** 화면 분류 순서이기도 하다. */
export const ARTICLE_CATEGORIES = [
  "격투기",
  "축구",
  "야구",
  "농구",
  "게임",
  "테크",
  "자동차",
  "돈",
  "몸",
  "장비",
  "컬처",
] as const;

export type ArticleCategory = (typeof ARTICLE_CATEGORIES)[number];

/** 사진을 실을 수 있는 이용 허락. 이 밖의 사진은 싣지 않는다. */
export const IMAGE_LICENSES = [
  "CC0",
  "Public domain",
  "CC BY 2.0",
  "CC BY 3.0",
  "CC BY 4.0",
  "CC BY-SA 2.0",
  "CC BY-SA 3.0",
  "CC BY-SA 4.0",
] as const;

const httpsUrl = z.string().url().startsWith("https://");

export const articleImageSchema = z.object({
  /** 실제 이미지 파일 주소(upload.wikimedia.org 등) */
  url: httpsUrl,
  /** 화면에 그대로 찍는 출처 표기: "사진: 홍길동 / Wikimedia Commons" */
  credit: z.string().min(3),
  license: z.enum(IMAGE_LICENSES),
  /** 이용 허락을 확인한 파일 설명 페이지 */
  sourceUrl: httpsUrl,
  alt: z.string().min(2),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

export const articleSourceSchema = z.object({
  title: z.string().min(2),
  /** 발행 주체: "UFC", "연합뉴스", "한국은행" */
  publisher: z.string().min(1),
  url: httpsUrl,
});

export const articleFrontmatterSchema = z.object({
  /** 40자 이하. 사실과 다른 과장 금지. */
  title: z.string().min(6).max(40),
  /** 제목 아래 한두 문장. 90자 이하. */
  deck: z.string().min(10).max(90),
  /** 영문 소문자·숫자·하이픈. 파일 이름 뒷부분과 같아야 한다. */
  slug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  category: z.enum(ARTICLE_CATEGORIES),
  tags: z.array(z.string().min(1)).min(1).max(8),
  /** ISO 8601, +09:00 오프셋 포함. 이 시각이 지나야 사이트에 보인다. */
  publishedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/),
  updatedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+09:00$/).optional(),
  author: z.string().default("편집부"),
  /** 표지 위 짧은 꼬리표: "프리뷰", "숫자로 보기", "장비" (12자 이하) */
  kicker: z.string().max(12).optional(),
  image: articleImageSchema.optional(),
  /** 본문 사실의 근거. 3개 이상, 서로 다른 사이트 2곳 이상. */
  sources: z.array(articleSourceSchema).min(3),
  /** 이 글이 다룬 키워드 순위의 키워드(있으면) */
  keywords: z.array(z.string()).default([]),
  /** 이 글이 다룬 일정의 id(있으면) */
  eventIds: z.array(z.string()).default([]),
  /** true면 배포 사이트에 싣지 않는다. */
  draft: z.boolean().default(false),
});

export type ArticleFrontmatter = z.infer<typeof articleFrontmatterSchema>;
export type ArticleImage = z.infer<typeof articleImageSchema>;
export type ArticleSource = z.infer<typeof articleSourceSchema>;

export interface Article extends ArticleFrontmatter {
  /** 마크다운 본문 */
  body: string;
  /** 본문 글자 수(공백 제외) */
  chars: number;
  /** 읽는 데 걸리는 분. 한국어 분당 500자 기준. */
  readingMinutes: number;
  /** 원본 파일 이름 */
  file: string;
}

export const ARTICLES_DIR = join(process.cwd(), "content", "articles");

/** 마크다운 기호를 걷어 낸 본문 글자 수(공백 제외). 검사 스크립트도 이 함수를 쓴다. */
export function countBodyChars(body: string): number {
  return body
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[*_>`|~-]/g, "")
    .replace(/\s+/g, "").length;
}

export function parseArticle(file: string, raw: string): Article {
  const { data, content } = matter(raw);
  const frontmatter = articleFrontmatterSchema.parse(data);
  const body = content.trim();
  const chars = countBodyChars(body);
  return { ...frontmatter, body, chars, readingMinutes: Math.max(1, Math.round(chars / 500)), file };
}

function readAll(): Article[] {
  let files: string[];
  try {
    files = readdirSync(ARTICLES_DIR).filter((name) => name.endsWith(".md"));
  } catch {
    return [];
  }
  const articles: Article[] = [];
  for (const file of files) {
    try {
      articles.push(parseArticle(file, readFileSync(join(ARTICLES_DIR, file), "utf-8")));
    } catch (error) {
      // 머리말이 깨진 글 하나 때문에 사이트 전체가 죽으면 안 된다. 그 글만 건너뛴다.
      console.warn(`[articles] ${file} 건너뜀: ${error instanceof Error ? error.message : error}`);
    }
  }
  return articles.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
}

/** 사이트에 보이는 글: 초안이 아니고 발행 시각이 지난 것. 최신순. */
export function loadArticles(now: Date = new Date()): Article[] {
  const showDrafts = process.env.NODE_ENV !== "production" && process.env.MAGAZINE_SHOW_DRAFTS === "1";
  return readAll().filter(
    (article) => (showDrafts || !article.draft) && Date.parse(article.publishedAt) <= now.getTime(),
  );
}

/** 검사·주제 고르기용: 초안과 예약 글까지 전부. */
export function loadAllArticles(): Article[] {
  return readAll();
}

export function findArticle(slug: string, now: Date = new Date()): Article | undefined {
  return loadArticles(now).find((article) => article.slug === slug);
}

export function articlesByCategory(category: ArticleCategory, now: Date = new Date()): Article[] {
  return loadArticles(now).filter((article) => article.category === category);
}

/** 같은 분류·같은 태그를 우선으로 고른 다른 글. */
export function relatedArticles(article: Article, limit = 3, now: Date = new Date()): Article[] {
  const tags = new Set(article.tags);
  return loadArticles(now)
    .filter((other) => other.slug !== article.slug)
    .map((other) => ({
      other,
      weight:
        (other.category === article.category ? 2 : 0) + other.tags.filter((tag) => tags.has(tag)).length,
    }))
    .sort((a, b) => b.weight - a.weight || b.other.publishedAt.localeCompare(a.other.publishedAt))
    .slice(0, limit)
    .map((entry) => entry.other);
}
