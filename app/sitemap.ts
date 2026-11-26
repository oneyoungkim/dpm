import type { MetadataRoute } from "next";
import { ARTICLE_CATEGORIES, loadArticles } from "@/lib/articles";
import { ARTICLE_CATEGORY_SLUG } from "@/lib/category-style";
import { absoluteUrl } from "@/lib/brand";
import { loadTrends } from "@/lib/trends";
import { loadEvents } from "@/lib/events";

export const revalidate = 600;

export default function sitemap(): MetadataRoute.Sitemap {
  const articles = loadArticles();
  const latest = articles[0]?.publishedAt;
  const trendsAt = loadTrends().generatedAt;
  const eventsAt = loadEvents().generatedAt;
  const present = new Set(articles.map((article) => article.category));

  return [
    { url: absoluteUrl("/"), lastModified: trendsAt, changeFrequency: "hourly", priority: 1 },
    { url: absoluteUrl("/rank"), lastModified: trendsAt, changeFrequency: "hourly", priority: 0.9 },
    { url: absoluteUrl("/schedule"), lastModified: eventsAt, changeFrequency: "daily", priority: 0.8 },
    { url: absoluteUrl("/magazine"), lastModified: latest, changeFrequency: "daily", priority: 0.9 },
    ...ARTICLE_CATEGORIES.filter((category) => present.has(category)).map((category) => ({
      url: absoluteUrl(`/magazine/c/${ARTICLE_CATEGORY_SLUG[category]}`),
      changeFrequency: "daily" as const,
      priority: 0.5,
    })),
    ...articles.map((article) => ({
      url: absoluteUrl(`/magazine/${article.slug}`),
      lastModified: article.updatedAt ?? article.publishedAt,
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    { url: absoluteUrl("/about"), changeFrequency: "yearly", priority: 0.2 },
    { url: absoluteUrl("/privacy"), changeFrequency: "yearly", priority: 0.1 },
  ];
}
