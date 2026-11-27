import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { findArticle, loadArticles, relatedArticles } from "@/lib/articles";
import { ARTICLE_CATEGORY_SLUG, ARTICLE_COLOR } from "@/lib/category-style";
import { BRAND, absoluteUrl } from "@/lib/brand";
import { loadTrends, mainChart } from "@/lib/trends";
import { loadEvents } from "@/lib/events";
import { formatDateKo } from "@/lib/kst";
import { RSS_ALTERNATE } from "@/lib/seo";
import { articleCrumbs, articleJsonLd, breadcrumbJsonLd } from "@/lib/structured-data";
import { JsonLd } from "@/components/JsonLd";
import { ArticleBody, splitBody } from "@/components/ArticleBody";
import { ArticleCard, formatArticleDate } from "@/components/ArticleCard";
import { ArticleCover } from "@/components/ArticleCover";
import { RankDelta } from "@/components/RankDelta";
import { AdSlot } from "@/components/AdSlot";

export const revalidate = 600;

export function generateStaticParams() {
  return loadArticles().map((article) => ({ slug: article.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const article = findArticle(slug);
  if (!article) return {};
  return {
    title: article.title,
    description: article.deck,
    keywords: article.tags,
    alternates: { canonical: `/magazine/${article.slug}`, types: RSS_ALTERNATE },
    // 공유 이미지는 같은 폴더의 opengraph-image.tsx 가 붙인다(여기서 images 를 적으면 그것이 빠진다).
    openGraph: {
      type: "article",
      title: article.title,
      description: article.deck,
      url: `/magazine/${article.slug}`,
      siteName: BRAND.name,
      locale: "ko_KR",
      publishedTime: article.publishedAt,
      modifiedTime: article.updatedAt ?? article.publishedAt,
      section: article.category,
      tags: article.tags,
      authors: [absoluteUrl("/about")],
    },
    twitter: { card: "summary_large_image", title: article.title, description: article.deck },
  };
}

/** 키워드 순위에서 온 낱말만. "evergreen:…" 같은 글감 표시는 뺀다. */
function rankKeywords(keywords: string[]): string[] {
  return [...new Set(keywords.map((keyword) => keyword.trim()))].filter(
    (keyword) => keyword.length > 0 && !/^[a-z-]+:/.test(keyword),
  );
}

export default async function ArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = findArticle(slug);
  if (!article) notFound();

  const [first, second] = splitBody(article.body);
  const related = relatedArticles(article, 3);
  const chart = mainChart(loadTrends(), 5);
  const color = ARTICLE_COLOR[article.category];
  // 글 끝 내부 링크: 이 글이 다룬 일정(일정 페이지로)과 키워드(순위 페이지로)
  const eventIds = new Set(article.eventIds);
  const relatedEvents =
    eventIds.size > 0
      ? loadEvents()
          .events.filter((event) => eventIds.has(event.id))
          .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      : [];
  const keywords = rankKeywords(article.keywords);

  return (
    <main id="main" className="article-page">
      <JsonLd data={[articleJsonLd(article), breadcrumbJsonLd(articleCrumbs(article))]} />

      <article className="article">
        <header className="article-head">
          <p className="mag-kicker" style={{ color }}>
            <Link href={`/magazine/c/${ARTICLE_CATEGORY_SLUG[article.category]}`}>{article.category}</Link>
            {article.kicker ? <span>{article.kicker}</span> : null}
          </p>
          <h1>{article.title}</h1>
          <p className="article-deck">{article.deck}</p>
          <p className="article-byline">
            <span>{article.author}</span>
            <time dateTime={article.publishedAt}>{formatArticleDate(article.publishedAt)}</time>
            {article.updatedAt ? <span>{formatArticleDate(article.updatedAt)} 고침</span> : null}
            <span>읽는 데 {article.readingMinutes}분</span>
          </p>
        </header>

        <ArticleCover article={article} size="page" priority />

        <div className="article-body">
          <ArticleBody markdown={first} />
          {second ? (
            <>
              <AdSlot placement="article-mid" shape="box" />
              <ArticleBody markdown={second} />
            </>
          ) : null}
        </div>

        <section className="article-sources" aria-labelledby="sources-title">
          <h2 id="sources-title">근거</h2>
          <ol>
            {article.sources.map((source) => (
              <li key={source.url}>
                <a href={source.url} target="_blank" rel="noopener noreferrer">
                  {source.title}
                </a>
                <span>{source.publisher}</span>
              </li>
            ))}
          </ol>
          <p>
            이 글은 AI가 위 자료를 읽고 썼으며, 자동 검사를 통과한 뒤 실렸습니다. 틀린 곳은{" "}
            <Link href="/about">소개 페이지</Link>의 방법으로 알려 주시면 고칩니다.
          </p>
        </section>

        <ul className="article-tags" aria-label="태그">
          {article.tags.map((tag) => (
            <li key={tag}>#{tag}</li>
          ))}
        </ul>

        {relatedEvents.length > 0 && (
          <ul className="article-tags article-links" aria-label="관련 일정">
            <li className="article-links-label">관련 일정</li>
            {relatedEvents.map((event) => (
              <li key={event.id}>
                <Link href="/schedule">
                  {event.title} · {formatDateKo(event.dateKey)}
                </Link>
              </li>
            ))}
          </ul>
        )}

        {keywords.length > 0 && (
          <ul className="article-tags article-links" aria-label="관련 키워드">
            <li className="article-links-label">관련 키워드</li>
            {keywords.map((keyword) => (
              <li key={keyword}>
                <Link href="/rank">{keyword}</Link>
              </li>
            ))}
          </ul>
        )}

        <AdSlot placement="article-end" />
      </article>

      <aside className="article-rail" aria-label="함께 보기">
        {chart.length > 0 && (
          <section className="rail-rank">
            <h2>지금 뜨는 말</h2>
            <ol>
              {chart.map((item) => (
                <li key={item.keyword}>
                  <span className="rank-num">{String(item.rank).padStart(2, "0")}</span>
                  <strong>{item.keyword}</strong>
                  <RankDelta delta={item.delta} />
                </li>
              ))}
            </ol>
            <Link href="/rank">전체 순위 →</Link>
          </section>
        )}
        <AdSlot placement="article-rail" shape="rail" />
      </aside>

      {related.length > 0 && (
        <section className="article-related" aria-labelledby="related-title">
          <h2 id="related-title">이어서 읽을 글</h2>
          <div className="mag-grid">
            {related.map((item) => (
              <ArticleCard key={item.slug} article={item} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
