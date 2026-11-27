import { recentArticles } from "@/lib/articles";
import { BRAND, absoluteUrl } from "@/lib/brand";
import { articlePath } from "@/lib/structured-data";

export const revalidate = 600;

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Google News 사이트맵(https://www.google.com/schemas/sitemap-news/0.9).
 * 구글 규칙대로 최근 이틀(48시간) 안에 낸 글만 담는다. 글이 없으면 빈 목록.
 */
export function GET() {
  const urls = recentArticles(48)
    .map((article) =>
      [
        "<url>",
        `<loc>${esc(absoluteUrl(articlePath(article)))}</loc>`,
        "<news:news>",
        "<news:publication>",
        `<news:name>${esc(BRAND.name)}</news:name>`,
        "<news:language>ko</news:language>",
        "</news:publication>",
        `<news:publication_date>${article.publishedAt}</news:publication_date>`,
        `<news:title>${esc(article.title)}</news:title>`,
        "</news:news>",
        "</url>",
      ].join(""),
    )
    .join("");

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" ` +
    `xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">` +
    urls +
    `</urlset>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
