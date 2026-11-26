import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ARTICLE_CATEGORIES, articlesByCategory } from "@/lib/articles";
import { ARTICLE_CATEGORY_SLUG, articleCategoryFromSlug } from "@/lib/category-style";
import { ArticleCard } from "@/components/ArticleCard";
import { CategoryNav } from "@/components/CategoryNav";

export const revalidate = 600;

export function generateStaticParams() {
  return ARTICLE_CATEGORIES.map((category) => ({ category: ARTICLE_CATEGORY_SLUG[category] }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category: slug } = await params;
  const category = articleCategoryFromSlug(slug);
  if (!category) return {};
  return {
    title: `${category} 매거진`,
    description: `${category} 글 모음. 숫자와 출처가 있는 글만 싣습니다.`,
    alternates: { canonical: `/magazine/c/${slug}` },
  };
}

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category: slug } = await params;
  const category = articleCategoryFromSlug(slug);
  if (!category) notFound();
  const articles = articlesByCategory(category);

  return (
    <main id="main" className="page">
      <header className="page-head">
        <p className="eyebrow">읽을 각 / 매거진</p>
        <h1>{category}</h1>
      </header>
      <CategoryNav current={category} />
      {articles.length === 0 ? (
        <p className="rank-empty">이 분류의 글은 아직 없습니다.</p>
      ) : (
        <div className="mag-grid">
          {articles.map((article) => (
            <ArticleCard key={article.slug} article={article} />
          ))}
        </div>
      )}
    </main>
  );
}
