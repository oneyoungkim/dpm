import { ImageResponse } from "next/og";
import { findArticle, loadArticles } from "@/lib/articles";
import { ARTICLE_COLOR } from "@/lib/category-style";
import { BRAND } from "@/lib/brand";
import { OG_SIZE, OgFrame, ogFonts } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = `${BRAND.name} 매거진`;

export function generateStaticParams() {
  return loadArticles().map((article) => ({ slug: article.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = findArticle(slug);
  const fonts = await ogFonts();
  if (!article) {
    return new ImageResponse(
      <OgFrame color="#c7ff16" label="매거진" title={BRAND.tagline} foot={BRAND.name} />,
      { ...size, fonts },
    );
  }
  return new ImageResponse(
    (
      <OgFrame
        color={ARTICLE_COLOR[article.category]}
        label={article.kicker ? `${article.category} · ${article.kicker}` : article.category}
        title={article.title}
        foot={article.deck.length > 44 ? `${article.deck.slice(0, 43)}…` : article.deck}
      />
    ),
    { ...size, fonts },
  );
}
