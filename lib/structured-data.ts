import type { Article, ArticleImage } from "./articles";
import type { InterestCategory, SportEvent } from "./types";
import { BRAND, absoluteUrl } from "./brand";
import { ARTICLE_CATEGORY_SLUG } from "./category-style";
import { broadcastOf } from "./broadcast";
import { interestCategoryOf } from "./interests";
import { KST_OFFSET_MS } from "./kst";

/**
 * 검색엔진에 주는 구조화 데이터(JSON-LD, schema.org).
 * 화면에 그리는 일은 components/JsonLd.tsx 가 하고, 여기서는 값만 만든다(next 없이 불러 볼 수 있게).
 *
 * 원칙: 데이터에 없는 값은 지어내지 않는다.
 * - 시각이 미정인 일정은 날짜만 적는다.
 * - 날짜가 확정되지 않은 일정(예상·소문, 월 단위), 미리보기용 예시 일정은 싣지 않는다.
 */

type Json = Record<string, unknown>;

const CONTEXT = "https://schema.org";
const HOME = absoluteUrl("/");
export const ORGANIZATION_ID = `${HOME}#organization`;
export const WEBSITE_ID = `${HOME}#website`;
/** 글 쓴이로 적는 이름. 사람이 아니라 편집팀(조직)이다. */
export const EDITORIAL_TEAM = `${BRAND.name} 편집팀`;

function logo(): Json {
  return {
    "@type": "ImageObject",
    "@id": `${HOME}#logo`,
    url: absoluteUrl(BRAND.logo.square512),
    contentUrl: absoluteUrl(BRAND.logo.square512),
    width: 512,
    height: 512,
    caption: BRAND.name,
  };
}

function organization(): Json {
  return {
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: BRAND.name,
    alternateName: BRAND.domain,
    url: HOME,
    logo: logo(),
    sameAs: [...BRAND.sameAs],
  };
}

/** 모든 페이지에 싣는 사이트 정보: Organization + WebSite */
export function siteJsonLd(): Json {
  return {
    "@context": CONTEXT,
    "@graph": [
      organization(),
      {
        "@type": "WebSite",
        "@id": WEBSITE_ID,
        name: BRAND.name,
        alternateName: BRAND.domain,
        url: HOME,
        description: BRAND.description,
        inLanguage: "ko-KR",
        publisher: { "@id": ORGANIZATION_ID },
      },
    ],
  };
}

export interface Crumb {
  name: string;
  /** 사이트 안 경로("/magazine") */
  path: string;
}

export function breadcrumbJsonLd(crumbs: Crumb[]): Json {
  return {
    "@context": CONTEXT,
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((crumb, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  };
}

export function articlePath(article: Pick<Article, "slug">): string {
  return `/magazine/${article.slug}`;
}

export function categoryPath(category: Article["category"]): string {
  return `/magazine/c/${ARTICLE_CATEGORY_SLUG[category]}`;
}

/** 홈 > 매거진 > 분류 > 글 */
export function articleCrumbs(article: Article): Crumb[] {
  return [
    { name: "홈", path: "/" },
    { name: "매거진", path: "/magazine" },
    { name: article.category, path: categoryPath(article.category) },
    { name: article.title, path: articlePath(article) },
  ];
}

/** 이용 허락 이름 → 허락서 주소. 표에 없는 값은 적지 않는다. */
const LICENSE_URL: Record<ArticleImage["license"], string> = {
  CC0: "https://creativecommons.org/publicdomain/zero/1.0/",
  "Public domain": "https://creativecommons.org/publicdomain/mark/1.0/",
  "CC BY 2.0": "https://creativecommons.org/licenses/by/2.0/",
  "CC BY 3.0": "https://creativecommons.org/licenses/by/3.0/",
  "CC BY 4.0": "https://creativecommons.org/licenses/by/4.0/",
  "CC BY-SA 2.0": "https://creativecommons.org/licenses/by-sa/2.0/",
  "CC BY-SA 3.0": "https://creativecommons.org/licenses/by-sa/3.0/",
  "CC BY-SA 4.0": "https://creativecommons.org/licenses/by-sa/4.0/",
};

/** 출처 표기 "사진: 홍길동 / Wikimedia Commons" → "홍길동" */
export function photoAuthor(credit: string): string {
  const name = credit
    .replace(/^\s*사진\s*[:·]\s*/, "")
    .replace(/\s*\/\s*Wikimedia Commons.*$/i, "")
    .trim();
  return name || credit.trim();
}

/** 구글 디스커버가 큰 사진으로 쓰려면 가로 1200px 이상이어야 한다. */
const MIN_IMAGE_WIDTH = 1200;

/**
 * 글의 대표 이미지들.
 * 가로 1200px 이상인 글 사진이 있으면 그것을 먼저, 그다음 글 공유 이미지(1200×630)를 둔다.
 * 사진 크기를 모르면(머리말에 width 없음) 원본이 충분히 크다고 보지 않고 공유 이미지만 쓴다.
 */
export function articleImages(article: Article): Json[] {
  const images: Json[] = [];
  const photo = article.image;
  if (photo?.width && photo.width >= MIN_IMAGE_WIDTH) {
    images.push({
      "@type": "ImageObject",
      url: photo.url,
      contentUrl: photo.url,
      width: photo.width,
      ...(photo.height ? { height: photo.height } : {}),
      caption: photo.alt,
      creditText: photo.credit,
      license: LICENSE_URL[photo.license],
      // 구글 이미지 메타데이터 권장 칸(서치콘솔 11-28 경고): 저작자·저작권 표기·이용 허락 페이지
      creator: { "@type": "Person", name: photoAuthor(photo.credit) },
      copyrightNotice: `${photoAuthor(photo.credit)} / Wikimedia Commons (${photo.license})`,
      acquireLicensePage: photo.sourceUrl,
    });
  }
  images.push({
    "@type": "ImageObject",
    url: absoluteUrl(`${articlePath(article)}/opengraph-image`),
    width: 1200,
    height: 630,
  });
  return images;
}

/** 매거진 글: NewsArticle */
export function articleJsonLd(article: Article): Json {
  const url = absoluteUrl(articlePath(article));
  return {
    "@context": CONTEXT,
    "@type": "NewsArticle",
    "@id": `${url}#article`,
    headline: article.title,
    description: article.deck,
    image: articleImages(article),
    datePublished: article.publishedAt,
    ...(article.updatedAt ? { dateModified: article.updatedAt } : {}),
    author: { "@type": "Organization", name: EDITORIAL_TEAM, url: absoluteUrl("/about") },
    publisher: { "@type": "Organization", "@id": ORGANIZATION_ID, name: BRAND.name, url: HOME, logo: logo() },
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    url,
    articleSection: article.category,
    keywords: article.tags,
    inLanguage: "ko-KR",
    isAccessibleForFree: true,
    isPartOf: { "@id": WEBSITE_ID },
    citation: article.sources.map((source) => source.url),
  };
}

/** 글 목록 페이지(매거진 전체, 분류): CollectionPage + 글 목록 */
export function collectionJsonLd({
  name,
  description,
  path,
  articles,
}: {
  name: string;
  description: string;
  path: string;
  articles: Article[];
}): Json {
  const url = absoluteUrl(path);
  return {
    "@context": CONTEXT,
    "@type": "CollectionPage",
    "@id": url,
    url,
    name,
    description,
    inLanguage: "ko-KR",
    isPartOf: { "@id": WEBSITE_ID },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: Math.min(articles.length, 30),
      itemListElement: articles.slice(0, 30).map((article, index) => ({
        "@type": "ListItem",
        position: index + 1,
        url: absoluteUrl(articlePath(article)),
        name: article.title,
      })),
    },
  };
}

/* ── 일정 ─────────────────────────────────────────────── */

/** SportsEvent 로 적는 관심사. 그 밖(게임·테크 등 출시·발표)은 Event. */
const SPORT_INTERESTS: ReadonlySet<InterestCategory> = new Set<InterestCategory>([
  "축구",
  "야구",
  "격투기",
  "e스포츠",
  "농구",
  "모터스포츠",
  "기타 스포츠",
  "빅 스포츠",
]);

/** ISO 시각 → 한국 시간 오프셋을 붙인 ISO("2026-11-28T05:00:00+09:00") */
export function kstIsoString(iso: string): string {
  const shifted = new Date(Date.parse(iso) + KST_OFFSET_MS);
  return `${shifted.toISOString().slice(0, 19)}+09:00`;
}

/** 시각이 확정된 일정만 시각까지, 나머지는 날짜(YYYY-MM-DD)만 */
export function eventStartDate(event: SportEvent): string {
  const timed = (event.datePrecision ?? "time") === "time" && !event.timeTbd;
  return timed ? kstIsoString(event.startsAt) : event.dateKey;
}

/** 구조화 데이터에 실어도 되는 일정인가: 날짜가 확정되고, 실제 수집된 것만 */
export function isStructuredEvent(event: SportEvent): boolean {
  if (event.preview) return false;
  if (event.status === "종료") return false;
  if ((event.confidence ?? "confirmed") !== "confirmed") return false;
  if (event.datePrecision === "month") return false;
  return !Number.isNaN(Date.parse(event.startsAt)) && /^\d{4}-\d{2}-\d{2}$/.test(event.dateKey);
}

function httpUrl(url: string | undefined): string | undefined {
  return url && /^https?:\/\//i.test(url) ? url : undefined;
}

export function eventJsonLd(event: SportEvent): Json {
  const sport = SPORT_INTERESTS.has(interestCategoryOf(event));
  const watchUrl = broadcastOf(event)?.outlets.map((outlet) => outlet.url).find(Boolean);
  // 일정 링크(중계·상세)가 없으면 일정을 확인한 공식 발표 주소
  const link = httpUrl(event.link) ?? httpUrl(event.sourceUrl);
  const venue = event.venue?.trim();

  const place = venue ? { "@type": "Place", name: venue } : null;
  // 온라인으로 보는 곳: 확인된 중계 주소, 없으면 일정 링크, 그것도 없으면 우리 일정 페이지
  const virtual = { "@type": "VirtualLocation", url: watchUrl ?? link ?? absoluteUrl("/schedule") };

  let attendance: string;
  let location: Json | Json[];
  if (place && watchUrl) {
    attendance = "https://schema.org/MixedEventAttendanceMode";
    location = [place, virtual];
  } else if (place) {
    attendance = "https://schema.org/OfflineEventAttendanceMode";
    location = place;
  } else {
    attendance = "https://schema.org/OnlineEventAttendanceMode";
    location = virtual;
  }

  const description = [event.series ?? event.league, event.round].filter(Boolean).join(" · ");

  return {
    "@type": sport ? "SportsEvent" : "Event",
    name: event.title,
    ...(description ? { description } : {}),
    startDate: eventStartDate(event),
    eventStatus:
      event.status === "취소" ? "https://schema.org/EventCancelled" : "https://schema.org/EventScheduled",
    eventAttendanceMode: attendance,
    location,
    url: link ?? absoluteUrl("/schedule"),
    ...(sport && event.home?.name ? { homeTeam: { "@type": "SportsTeam", name: event.home.name } } : {}),
    ...(sport && event.away?.name ? { awayTeam: { "@type": "SportsTeam", name: event.away.name } } : {}),
  };
}

/**
 * 일정 페이지: 앞으로 30일 주요 일정 최대 limit개를 ItemList 로.
 * 하이프 높은 순으로 고른 뒤 시작 순서로 늘어놓는다.
 */
export function scheduleJsonLd(events: SportEvent[], limit = 20): Json | null {
  const picked = events
    .filter(isStructuredEvent)
    .filter((event) => event.status !== "취소")
    .sort((a, b) => b.hype - a.hype || a.startsAt.localeCompare(b.startsAt))
    .slice(0, limit)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  if (picked.length === 0) return null;
  return {
    "@context": CONTEXT,
    "@type": "ItemList",
    name: "앞으로 30일 주요 일정",
    url: absoluteUrl("/schedule"),
    numberOfItems: picked.length,
    itemListElement: picked.map((event, index) => ({
      "@type": "ListItem",
      position: index + 1,
      item: eventJsonLd(event),
    })),
  };
}
