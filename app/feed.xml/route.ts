import { loadArticles } from "@/lib/articles";
import { BRAND, absoluteUrl } from "@/lib/brand";

export const revalidate = 600;

function esc(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** 매거진 RSS. 최신 30편. */
export function GET() {
  const items = loadArticles()
    .slice(0, 30)
    .map((article) => {
      const url = absoluteUrl(`/magazine/${article.slug}`);
      return [
        "<item>",
        `<title>${esc(article.title)}</title>`,
        `<link>${url}</link>`,
        `<guid isPermaLink="true">${url}</guid>`,
        `<pubDate>${new Date(article.publishedAt).toUTCString()}</pubDate>`,
        `<category>${esc(article.category)}</category>`,
        `<description>${esc(article.deck)}</description>`,
        "</item>",
      ].join("");
    })
    .join("");

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>` +
    `<title>${esc(BRAND.name)} 매거진</title>` +
    `<link>${absoluteUrl("/magazine")}</link>` +
    `<description>${esc(BRAND.description)}</description>` +
    `<language>ko</language>` +
    // RSS 2.0 채널 그림은 가로 144px 이하라서 96px G 아이콘을 쓴다.
    `<image><url>${absoluteUrl("/brand/gak-icon-96.png")}</url><title>${esc(BRAND.name)} 매거진</title>` +
    `<link>${absoluteUrl("/magazine")}</link><width>96</width><height>96</height></image>` +
    `<atom:link href="${absoluteUrl("/feed.xml")}" rel="self" type="application/rss+xml"/>` +
    items +
    `</channel></rss>`;

  return new Response(xml, {
    headers: { "Content-Type": "application/rss+xml; charset=utf-8" },
  });
}
