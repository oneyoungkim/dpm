import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ARTICLE_CATEGORIES, articlesByCategory, type ArticleCategory } from "@/lib/articles";
import { ARTICLE_CATEGORY_SLUG, articleCategoryFromSlug } from "@/lib/category-style";
import { ArticleCard } from "@/components/ArticleCard";
import { CategoryNav } from "@/components/CategoryNav";
import { JsonLd } from "@/components/JsonLd";
import { pageMetadata } from "@/lib/seo";
import { breadcrumbJsonLd, categoryPath, collectionJsonLd } from "@/lib/structured-data";

export const revalidate = 600;

export function generateStaticParams() {
  return ARTICLE_CATEGORIES.map((category) => ({ category: ARTICLE_CATEGORY_SLUG[category] }));
}

function categoryDescription(category: ArticleCategory): string {
  return `${category} 글 모음. 숫자와 출처가 있는 글만 싣습니다.`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ category: string }>;
}): Promise<Metadata> {
  const { category: slug } = await params;
  const category = articleCategoryFromSlug(slug);
  if (!category) return {};
  const meta = pageMetadata({
    title: `${category} 매거진`,
    description: categoryDescription(category),
    path: categoryPath(category),
  });
  // 글이 아직 없는 분류는 빈 페이지라 검색에 올리지 않는다(사이트맵에서도 뺀다).
  if (articlesByCategory(category).length === 0) meta.robots = { index: false, follow: true };
  return meta;
}

export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category: slug } = await params;
  const category = articleCategoryFromSlug(slug);
  if (!category) notFound();
  const articles = articlesByCategory(category);

  return (
    <main id="main" className="page">
      <JsonLd
        data={[
          breadcrumbJsonLd([
            { name: "홈", path: "/" },
            { name: "매거진", path: "/magazine" },
            { name: category, path: categoryPath(category) },
          ]),
          collectionJsonLd({
            name: `${category} 매거진`,
            description: categoryDescription(category),
            path: categoryPath(category),
            articles,
          }),
        ]}
      />
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
