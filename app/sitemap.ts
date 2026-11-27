import type { MetadataRoute } from "next";
import { ARTICLE_CATEGORIES, loadArticles, type Article } from "@/lib/articles";
import { absoluteUrl } from "@/lib/brand";
import { articlePath, categoryPath } from "@/lib/structured-data";
import { loadTrends } from "@/lib/trends";
import { loadEvents } from "@/lib/events";

export const revalidate = 600;

/** 글이 마지막으로 바뀐 시각: 고친 날이 있으면 그날, 없으면 발행 시각 */
function modifiedAt(article: Article): string {
  return article.updatedAt ?? article.publishedAt;
}

function latest(articles: Article[]): string | undefined {
  return articles.map(modifiedAt).sort().at(-1);
}

export default function sitemap(): MetadataRoute.Sitemap {
  const articles = loadArticles();
  const trendsAt = loadTrends().generatedAt;
  const eventsAt = loadEvents().generatedAt;

  return [
    { url: absoluteUrl("/"), lastModified: trendsAt, changeFrequency: "hourly", priority: 1 },
    { url: absoluteUrl("/rank"), lastModified: trendsAt, changeFrequency: "hourly", priority: 0.9 },
    { url: absoluteUrl("/schedule"), lastModified: eventsAt, changeFrequency: "daily", priority: 0.8 },
    { url: absoluteUrl("/magazine"), lastModified: latest(articles), changeFrequency: "daily", priority: 0.9 },
    // 글이 있는 분류만 싣는다. 빈 분류 페이지는 noindex다.
    ...ARTICLE_CATEGORIES.flatMap((category) => {
      const inCategory = articles.filter((article) => article.category === category);
      if (inCategory.length === 0) return [];
      return [
        {
          url: absoluteUrl(categoryPath(category)),
          lastModified: latest(inCategory),
          changeFrequency: "daily" as const,
          priority: 0.5,
        },
      ];
    }),
    ...articles.map((article) => ({
      url: absoluteUrl(articlePath(article)),
      lastModified: modifiedAt(article),
      changeFrequency: "monthly" as const,
      priority: 0.7,
      ...(article.image ? { images: [article.image.url] } : {}),
    })),
    { url: absoluteUrl("/about"), changeFrequency: "yearly", priority: 0.2 },
    { url: absoluteUrl("/privacy"), changeFrequency: "yearly", priority: 0.1 },
  ];
}
